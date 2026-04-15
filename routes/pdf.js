'use strict';

const express = require('express');
const { generateCreditInquiryPdfBuffer } = require('../lib/pdf/creditInquiryPdf');
const { generateForm4506cPdfBuffer } = require('../lib/pdf/form4506cPdf');

const router = express.Router();

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
    const bytes = await generateForm4506cPdfBuffer(req.body || {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="IRS-Form-4506-C-filled.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('[PDF] Form 4506-C error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate Form 4506-C PDF.' });
  }
});

module.exports = router;
