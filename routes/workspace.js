const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const ver = res.locals.v;
  const ext = res.locals.jsExt;
  res.render('workspace', {
    title: 'Document Workspace',
    extraHead: `<link rel="stylesheet" href="/css/workspace.css?v=${ver}">`,
    extraScripts: `<script src="/js/workspace${ext}?v=${ver}"></script>`
  });
});

module.exports = router;
