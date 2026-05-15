'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const router = require('../../routes/documents');

function renderDocumentRoute(path) {
  return new Promise((resolve, reject) => {
    let rendered = null;
    const req = {
      method: 'GET',
      url: path,
      originalUrl: '/documents' + path,
      baseUrl: '/documents',
      path,
      query: {}
    };
    const res = {
      locals: {
        v: 'test-version',
        jsExt: '.js',
        basePath: '/docs'
      },
      render(view, options) {
        rendered = { view, options };
        resolve(rendered);
      },
      setHeader() {},
      getHeader() {},
      end() {}
    };

    router.handle(req, res, (err) => {
      if (err) return reject(err);
      if (!rendered) reject(new Error('Route did not render'));
    });
  });
}

test('application summary document route wires view, styles, and scripts', async () => {
  const rendered = await renderDocumentRoute('/application-summary');

  assert.equal(rendered.view, 'documents/application-summary');
  assert.equal(rendered.options.title, 'Application Summarizer');
  assert.equal(rendered.options.doc.slug, 'application-summary');
  assert.equal(rendered.options.doc.category, 'borrower');
  assert.match(rendered.options.extraHead, /\/docs\/css\/documents\/application-summary\.css\?v=test-version/);
  assert.match(rendered.options.extraScripts, /\/docs\/js\/shared\/mismo-parser\.js\?v=test-version/);
  assert.match(rendered.options.extraScripts, /\/docs\/js\/shared\/application-summary-core\.js\?v=test-version/);
  assert.match(rendered.options.extraScripts, /\/docs\/js\/documents\/application-summary\.js\?v=test-version/);
});
