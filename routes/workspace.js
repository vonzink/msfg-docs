'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const ver = res.locals.v;
  const ext = res.locals.jsExt;
  const bp = res.locals.basePath || '';
  res.render('workspace', {
    title: 'Document Workspace',
    extraHead: `<link rel="stylesheet" href="${bp}/css/workspace.css?v=${ver}">`,
    extraScripts:
      `<script src="${bp}/js/shared/mismo-parser${ext}?v=${ver}"></script>` +
      `<script src="${bp}/js/workspace-mismo${ext}?v=${ver}"></script>` +
      `<script src="${bp}/js/workspace${ext}?v=${ver}"></script>`
  });
});

module.exports = router;
