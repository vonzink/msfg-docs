'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const emailRouter = require('../../routes/email');

test('buildEmailHTML renders application divider sections with stronger separation', () => {
  assert.equal(typeof emailRouter.buildEmailHTML, 'function');

  const html = emailRouter.buildEmailHTML({
    title: 'Application Summary',
    sections: [
      {
        heading: 'Application 2 of 2 - John Borrower',
        variant: 'application-divider',
        rows: [
          { label: 'Borrower', value: 'John Borrower | Cosigner' },
          { label: 'Review items', value: 'Employment: Confirm prior employer.' }
        ]
      }
    ]
  }, '', { emailSignature: {} });

  assert.match(html, /Application 2 of 2 - John Borrower/);
  assert.match(html, /border-left:4px solid #2d6a4f/);
  assert.match(html, /background:#eef7f1/);
});
