const express = require('express');
const router = express.Router();

const docConfig = require('../config/documents.json');

function findDoc(slug) {
  return docConfig.documents.find(d => d.slug === slug);
}

/* ---- Document Routes ---- */

const docRoutes = [
  { slug: 'credit-inquiry',   view: 'documents/credit-inquiry',   title: 'Credit Inquiry Letter',   css: 'credit-inquiry' },
  { slug: 'pre-approval',     view: 'documents/pre-approval',     title: 'Pre-Approval Letter',     css: 'pre-approval' },
  { slug: 'address-lox',      view: 'documents/address-lox',      title: 'Address LOX',             css: 'address-lox' },
  { slug: 'income-statement',  view: 'documents/income-statement',  title: 'Income Statement',        css: 'income-statement' },
  { slug: 'balance-sheet',    view: 'documents/balance-sheet',    title: 'Balance Sheet',           css: 'balance-sheet' },
  { slug: 'invoice',          view: 'documents/invoice',          title: 'Generic Invoice',         css: 'invoice' },
  { slug: 'form-4506-c',      view: 'documents/form-4506-c',      title: 'IRS Form 4506-C',         css: 'form-4506-c' }
];

docRoutes.forEach(dr => {
  router.get(`/${dr.slug}`, (req, res) => {
    const ver = res.locals.v;
    const ext = res.locals.jsExt;
    const extraHeadParts = [];
    if (dr.css) extraHeadParts.push(`<link rel="stylesheet" href="/css/documents/${dr.css}.css?v=${ver}">`);

    res.render(dr.view, {
      title: dr.title,
      doc: findDoc(dr.slug),
      bodyClass: req.query && req.query.embed ? 'embed-mode' : undefined,
      extraHead: extraHeadParts.length ? extraHeadParts.join('') : undefined,
      extraScripts: `<script src="/js/documents/${dr.slug}${ext}?v=${ver}"></script>`
    });
  });
});

module.exports = router;
