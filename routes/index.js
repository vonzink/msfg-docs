'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const ver = res.locals.v;
  const bp = res.locals.basePath || '';
  res.render('hub', {
    title: 'Document Hub',
    bodyClass: 'hub-page',
    extraHead: `<link rel="stylesheet" href="${bp}/css/page-hub.css?v=${ver}">`,
    extraScripts: `<script src="${bp}/js/hub${res.locals.jsExt}?v=${ver}"></script>`
  });
});

module.exports = router;
