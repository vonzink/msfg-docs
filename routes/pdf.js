'use strict';

const express = require('express');
const { generateCreditInquiryPdfBuffer } = require('../lib/pdf/creditInquiryPdf');
const { generateForm4506cPdfBuffer } = require('../lib/pdf/form4506cPdf');
const { generateSsa89PdfBuffer } = require('../lib/pdf/ssa89Pdf');
const { ensurePdfBytes } = require('../services/dashboardSync');

const router = express.Router();

/** Pull the user's Cognito Bearer off the request so we can forward it to
 *  the dashboard backend when fetching an investor's pre-filled PDF. */
function getAuthToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (req.cookies && req.cookies.auth_token) return req.cookies.auth_token;
  return null;
}

/** Resolve body.investorPdfRef → PDF bytes via dashboardSync. Failures
 *  are swallowed (logged) so we always fall back to the blank IRS template
 *  rather than 500-ing an end-user PDF download. */
async function resolveInvestorBaseBytes(req) {
  const ref = req.body && req.body.investorPdfRef;
  if (!ref || !ref.investorId || !ref.docId) return null;
  try {
    return await ensurePdfBytes(ref.investorId, ref.docId, getAuthToken(req));
  } catch (e) {
    console.warn('[PDF] investor PDF fetch failed, falling back to blank:', e.message);
    return null;
  }
}

router.post('/credit-inquiry', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const bytes = await generateCreditInquiryPdfBuffer(req.body || {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Credit-Inquiry-Letter.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('[PDF] Credit Inquiry error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF.' });
  }
});

router.post('/form-4506-c', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const baseTemplateBytes = await resolveInvestorBaseBytes(req);
    const bytes = await generateForm4506cPdfBuffer(req.body || {}, { baseTemplateBytes });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="IRS-Form-4506-C-filled.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('[PDF] Form 4506-C error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate Form 4506-C PDF.' });
  }
});

router.post('/ssa-89', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const baseTemplateBytes = await resolveInvestorBaseBytes(req);
    const bytes = await generateSsa89PdfBuffer(req.body || {}, { baseTemplateBytes });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SSA-89-filled.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('[PDF] SSA-89 error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate SSA-89 PDF.' });
  }
});

module.exports = router;
