'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

const { generateStructuredPdfBuffer } = require('../../../lib/pdf/structuredPdf');

test('generateStructuredPdfBuffer', async (t) => {
  await t.test('produces a valid PDF from structured session data', async () => {
    const bytes = await generateStructuredPdfBuffer({
      title: 'Application Summary',
      sections: [
        {
          heading: 'Loan overview',
          rows: [
            { label: 'Borrower', value: 'Veronica Sawaged' },
            { label: 'Subject Property', value: '17630 East 104th Place, Commerce City, CO 80022' }
          ]
        },
        {
          heading: 'Action items',
          rows: [
            {
              label: 'Residence',
              value: 'Confirm prior residence history covers the full two-year review period.'
            }
          ]
        }
      ]
    });

    assert.ok(bytes instanceof Uint8Array);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');

    const loaded = await PDFDocument.load(bytes);
    assert.ok(loaded.getPageCount() >= 1);
  });

  await t.test('sanitizes unsupported glyphs before measuring wrapped rows', async () => {
    const bytes = await generateStructuredPdfBuffer({
      title: 'Application Summary',
      sections: [
        {
          heading: 'Review flags',
          rows: [
            {
              label: 'Search',
              value: 'Needs review 🔎 because this value should not break PDF generation.'
            }
          ]
        }
      ]
    });

    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  });

  await t.test('paginates long structured session reports', async () => {
    const sections = Array.from({ length: 6 }, (_, sectionIndex) => ({
      heading: `Borrower section ${sectionIndex + 1}`,
      rows: Array.from({ length: 12 }, (_, rowIndex) => ({
        label: `Field ${rowIndex + 1}`,
        value: 'This is a longer borrower-facing value that should wrap cleanly inside the table without overlapping adjacent rows. '.repeat(2)
      }))
    }));

    const bytes = await generateStructuredPdfBuffer({ title: 'Long Session Report', sections });
    const loaded = await PDFDocument.load(bytes);

    assert.ok(loaded.getPageCount() > 1, 'should produce more than one page');
  });
});
