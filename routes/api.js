'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const siteConfigPath = path.join(__dirname, '..', 'config', 'site.json');

function readSiteConfig() {
  try {
    return JSON.parse(fs.readFileSync(siteConfigPath, 'utf-8'));
  } catch (err) {
    return null;
  }
}

/* ---- Email sending ---- */

const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many emails. Please wait a minute.' }
});

/**
 * Build HTML email body from document data.
 *  docData: { title, sections: [{ heading, rows: [{label, value}] }] }
 */
function buildEmailHTML(docData, personalMessage, siteConfig) {
  const sig = siteConfig.emailSignature || {};
  const siteName = siteConfig.siteName || 'MSFG Document Creator';
  const primaryColor = '#2d6a4f';

  let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:${primaryColor};padding:20px 30px;">
  <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${escHTML(docData.title || 'Document')}</h1>
</td></tr>`;

  /* Personal message */
  if (personalMessage) {
    html += `
<tr><td style="padding:20px 30px 0;">
  <p style="color:#333;font-size:14px;line-height:1.5;margin:0;">${escHTML(personalMessage).replace(/\n/g, '<br>')}</p>
</td></tr>`;
  }

  /* Data sections */
  if (docData.sections && docData.sections.length) {
    docData.sections.forEach(function (sec) {
      html += `
<tr><td style="padding:20px 30px 0;">
  <h3 style="color:${primaryColor};font-size:15px;margin:0 0 10px;"><span style="padding-bottom:6px;border-bottom:2px solid ${primaryColor};">${escHTML(sec.heading)}</span></h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">`;

      sec.rows.forEach(function (row, i) {
        const bg = i % 2 === 0 ? '#fafafa' : '#fff';
        const isTotal = row.isTotal;
        const weight = isTotal ? 'font-weight:700;' : '';
        const border = isTotal ? 'border-top:2px solid #ddd;' : '';
        const useStacked = row.stacked || (row.value && row.value.length > 60);
        if (row.stacked) {
          const bullet = row.bulletColor
            ? `<span style="color:${row.bulletColor};">&#9679;</span>&nbsp;&nbsp;`
            : '';
          html += `
    <tr style="background:${bg};">
      <td colspan="2" style="padding:8px 12px ${row.value ? '1px' : '8px'};color:#333;font-size:13px;">${bullet}${escHTML(row.label)}</td>
    </tr>`;
          if (row.value) {
            html += `
    <tr style="background:${bg};">
      <td colspan="2" style="padding:0 12px 8px ${row.bulletColor ? '28px' : '28px'};color:#888;font-size:11px;line-height:1.4;">${escHTML(row.value)}</td>
    </tr>`;
          }
        } else if (useStacked) {
          html += `
    <tr style="background:${bg};${border}">
      <td colspan="2" style="padding:8px 12px 2px;color:#555;${weight}font-size:13px;">${escHTML(row.label)}</td>
    </tr>
    <tr style="background:${bg};">
      <td colspan="2" style="padding:2px 12px 8px;color:#222;font-size:13px;line-height:1.4;">${escHTML(row.value)}</td>
    </tr>`;
        } else {
          const boldVal = row.bold ? 'font-weight:700;font-size:1.05em;' : '';
          html += `
    <tr style="background:${bg};${border}">
      <td style="padding:8px 12px;color:#555;${weight}">${escHTML(row.label)}</td>
      <td style="padding:8px 12px;text-align:right;color:#222;${weight}${boldVal}">${escHTML(row.value)}</td>
    </tr>`;
        }
      });
      html += '</table></td></tr>';
    });
  }

  /* Signature */
  if (sig.name) {
    html += `
<tr><td style="padding:24px 30px 0;">
  <table cellpadding="0" cellspacing="0" style="border-top:1px solid #e0e0e0;padding-top:16px;width:100%;">
  <tr><td>
    <p style="margin:0;font-size:14px;font-weight:700;color:#333;">${escHTML(sig.name)}</p>`;
    if (sig.title) html += `<p style="margin:2px 0 0;font-size:13px;color:#666;">${escHTML(sig.title)}</p>`;
    if (sig.phone) html += `<p style="margin:2px 0 0;font-size:13px;color:#666;">${escHTML(sig.phone)}</p>`;
    if (sig.email) html += `<p style="margin:2px 0 0;font-size:13px;"><a href="mailto:${escHTML(sig.email)}" style="color:${primaryColor};">${escHTML(sig.email)}</a></p>`;
    if (sig.nmls) html += `<p style="margin:2px 0 0;font-size:12px;color:#999;">NMLS# ${escHTML(sig.nmls)}</p>`;
    if (sig.company) html += `<p style="margin:4px 0 0;font-size:13px;color:#555;font-weight:600;">${escHTML(sig.company)}</p>`;
    html += '</td></tr></table></td></tr>';
  }

  /* Footer */
  html += `
<tr><td style="padding:20px 30px;">
  <p style="font-size:11px;color:#999;margin:0;text-align:center;">
    This document is for informational purposes only and does not constitute a binding agreement.
    Please contact your loan officer for details.
  </p>
</td></tr>

</table>
</td></tr></table>

<!-- Spacer below content — gives Outlook a cursor landing zone when forwarding -->
<div style="padding:8px 0;">&nbsp;</div>
<div style="padding:8px 0;">&nbsp;</div>
<div style="padding:8px 0;">&nbsp;</div>

</body></html>`;

  return html;
}

function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * POST /api/email/send
 * Body: { to, subject, message, calcData: { title, sections } }
 */
router.post('/email/send', emailLimiter, express.json(), async (req, res) => {
  try {
    const { to, subject, message, calcData } = req.body;

    if (!to || !subject || !calcData) {
      return res.status(400).json({ success: false, message: 'Missing required fields (to, subject, calcData).' });
    }

    /* Basic email validation */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    const siteConfig = readSiteConfig();
    if (!siteConfig) {
      return res.status(500).json({ success: false, message: 'Could not read site configuration.' });
    }

    const smtp = siteConfig.smtp;
    if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({
        success: false,
        message: 'Email not configured. Set up SMTP in site config.'
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port, 10) || 587,
      secure: smtp.secure === true || smtp.port === '465',
      auth: { user: smtp.user, pass: smtp.pass }
    });

    const fromName = siteConfig.emailSignature?.name || siteConfig.siteName || 'MSFG Document Creator';
    const fromEmail = smtp.from || smtp.user;
    const htmlBody = buildEmailHTML(calcData, message, siteConfig);

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to,
      subject: subject,
      html: htmlBody
    });

    res.json({ success: true, message: 'Email sent successfully.' });
  } catch (err) {
    console.error('[Email] Send error:', err.message);
    const userMsg = err.code === 'EAUTH'
      ? 'SMTP authentication failed. Check your email credentials.'
      : err.code === 'ECONNREFUSED'
        ? 'Could not connect to email server. Check SMTP host and port.'
        : 'Failed to send email. Please try again.';
    res.status(500).json({ success: false, message: userMsg });
  }
});

module.exports = router;
