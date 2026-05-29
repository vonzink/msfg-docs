'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const docConfig = require('../config/documents.json');

function findDoc(slug) {
  return docConfig.documents.find(d => d.slug === slug);
}

// Which slugs actually ship a per-doc stylesheet. Computed once at
// startup so we only emit a <link> for a file that exists (docs whose
// styling comes entirely from layout.css / letter-styles.css have none).
const docCssDir = path.join(__dirname, '..', 'public', 'css', 'documents');
function hasDocCss(slug) {
  try {
    return fs.statSync(path.join(docCssDir, `${slug}.css`)).size > 0;
  } catch (_e) {
    return false;
  }
}

/* ---- Document Routes ----
   Derived from config/documents.json so the document registry has a
   single source of truth. view and css follow the slug; title is the
   doc's display name; sharedScripts (only application-summary needs
   any) come straight from the config entry. */

const docRoutes = docConfig.documents.map(d => ({
  slug: d.slug,
  view: `documents/${d.slug}`,
  title: d.name,
  css: hasDocCss(d.slug) ? d.slug : null,
  sharedScripts: d.sharedScripts || []
}));

docRoutes.forEach(dr => {
  router.get(`/${dr.slug}`, (req, res) => {
    const ver = res.locals.v;
    const ext = res.locals.jsExt;
    const bp = res.locals.basePath || '';
    const extraHeadParts = [];
    if (dr.css) extraHeadParts.push(`<link rel="stylesheet" href="${bp}/css/documents/${dr.css}.css?v=${ver}">`);

    const scripts = (dr.sharedScripts || []).map((name) => {
      return `<script src="${bp}/js/shared/${name}${ext}?v=${ver}"></script>`;
    });
    scripts.push(`<script src="${bp}/js/documents/${dr.slug}${ext}?v=${ver}"></script>`);

    res.render(dr.view, {
      title: dr.title,
      doc: findDoc(dr.slug),
      bodyClass: req.query && req.query.embed ? 'embed-mode' : undefined,
      extraHead: extraHeadParts.length ? extraHeadParts.join('') : undefined,
      extraScripts: scripts.join('')
    });
  });
});

module.exports = router;
