'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const ver = res.locals.v;
  const ext = res.locals.jsExt;
  const bp = res.locals.basePath || '';
  res.render('report', {
    title: 'Session Report',
    extraHead: `<link rel="stylesheet" href="${bp}/css/report.css?v=${ver}">`,
    extraScripts:
      `<script src="${bp}/js/shared/report-templates${ext}?v=${ver}"></script>\n` +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js"></script>\n' +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js"></script>\n' +
      `<script src="${bp}/js/report-page${ext}?v=${ver}"></script>`
  });
});

module.exports = router;
