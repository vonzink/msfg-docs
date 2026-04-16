'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth/cognito');
const templateService = require('../lib/pdf/templateService');

// Workspace lists the user's own PDF templates in the selector. Auth gate
// gives us req.user.sub for per-user filtering. In dev mode the middleware
// attaches a mock sub='dev' user so local development still works.
router.use(requireAuth());

router.get('/', (req, res) => {
  const ver = res.locals.v;
  const ext = res.locals.jsExt;
  const bp = res.locals.basePath || '';
  let templates = [];
  try {
    templates = templateService.listTemplates(req.user && req.user.sub);
  } catch (_e) {
    // Tolerate registry read errors — workspace still renders the
    // built-in documents from config/documents.json.
  }
  res.render('workspace', {
    title: 'Document Workspace',
    templates,
    extraHead: `<link rel="stylesheet" href="${bp}/css/workspace.css?v=${ver}">`,
    extraScripts:
      `<script src="${bp}/js/shared/mismo-parser${ext}?v=${ver}"></script>` +
      `<script src="${bp}/js/workspace-mismo${ext}?v=${ver}"></script>` +
      `<script src="${bp}/js/workspace${ext}?v=${ver}"></script>`
  });
});

module.exports = router;
