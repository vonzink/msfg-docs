'use strict';

const express = require('express');
const { PDFDocument } = require('pdf-lib');

const router = express.Router();

/* ---- Page route ----
   Drops the cdnjs pdfmake/vfs_fonts script tags — Export PDF on the
   session report now uses the server-side pdf-lib merge endpoint
   below, since each captured item carries its own filled PDF bytes
   (no need to re-render structured data into a PDF in the browser). */

router.get('/', (req, res) => {
  const ver = res.locals.v;
  const ext = res.locals.jsExt;
  const bp = res.locals.basePath || '';
  res.render('report', {
    title: 'Session Report',
    extraHead: `<link rel="stylesheet" href="${bp}/css/report.css?v=${ver}">`,
    extraScripts:
      `<script src="${bp}/js/shared/report-templates${ext}?v=${ver}"></script>\n` +
      `<script src="${bp}/js/report-page${ext}?v=${ver}"></script>`
  });
});

/* ---- API ----
   Merge multiple base64-encoded PDFs into a single PDF, in the given
   order. Used by the Export PDF action on the session report — each
   item's filled PDF is appended page-for-page so the user gets one
   downloadable archive of their session.
   Body: { pdfs: [<base64>, <base64>, ...] }
   Response: application/pdf binary. */
router.post('/api/merge-pdfs', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const list = Array.isArray(req.body && req.body.pdfs) ? req.body.pdfs : [];
    if (!list.length) {
      return res.status(400).json({ success: false, message: 'No PDFs provided.' });
    }

    const merged = await PDFDocument.create();
    let appendedPages = 0;

    for (let i = 0; i < list.length; i++) {
      const b64 = String(list[i] || '').trim();
      if (!b64) continue;
      let bytes;
      try { bytes = Buffer.from(b64, 'base64'); }
      catch (_e) { continue; }
      try {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        appendedPages += pages.length;
      } catch (perFileErr) {
        // Skip a corrupt entry rather than 500 the whole export.
        console.warn('[Report] skipping unreadable PDF in merge:', perFileErr.message);
      }
    }

    if (appendedPages === 0) {
      return res.status(400).json({ success: false, message: 'No readable PDFs in payload.' });
    }

    const out = await merged.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="MSFG-Session-Report.pdf"');
    res.send(Buffer.from(out));
  } catch (err) {
    console.error('[Report] merge error:', err);
    res.status(500).json({ success: false, message: err.message || 'Merge failed.' });
  }
});

module.exports = router;
