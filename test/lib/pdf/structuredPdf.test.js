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

  await t.test('renders application summary sessions as one page per application', async () => {
    function applicationSections(name, index) {
      return [
        {
          heading: `Application ${index} of 2 - ${name}`,
          variant: 'application-divider',
          rows: [
            { label: 'Borrower', value: `${name} | Borrower | ***-**-1234 | 1980-01-01 | USCitizen | Married | 2 | (555) 111-2222 | borrower@example.com` },
            { label: 'Residence history', value: 'Complete - 2 years listed' },
            { label: 'Employment history', value: 'Complete - 2 years listed' },
            { label: 'Review items', value: index === 1 ? 'None' : 'Employment: Confirm prior employer dates.' }
          ]
        },
        {
          heading: `Residence history - ${name}`,
          rows: [
            { label: 'Current - 1 year', value: '100 Current Street, Denver, CO 80202' },
            { label: 'Prior - 1 year', value: '200 Prior Avenue, Aurora, CO 80010' },
            { label: 'Prior - 6 months', value: '300 Earlier Road, Lakewood, CO 80215' }
          ]
        },
        {
          heading: `Employment history - ${name}`,
          rows: [
            { label: 'Current - 1 year', value: 'Current Employer - Analyst' },
            { label: 'Prior - 1 year', value: 'Prior Employer - Assistant' },
            { label: 'Prior - 8 months', value: 'Earlier Employer - Associate' }
          ]
        },
        {
          heading: `Financial assets - ${name}`,
          rows: [
            { label: 'Checking - Bank One', value: '$5,000 | Checking account' },
            { label: 'Savings - Bank Two', value: '$12,000 | Savings account' },
            { label: 'Retirement - Broker', value: '$25,000 | Retirement account' }
          ]
        },
        {
          heading: `Liabilities - ${name}`,
          rows: [
            { label: 'CreditCard - Card One - 1111', value: '$1,200 | $40 | No | No' },
            { label: 'Installment - Auto Lender - 2222', value: '$14,000 | $420 | No | No' },
            { label: 'CreditCard - Card Two - 3333', value: '$900 | $35 | No | No' },
            { label: 'Mortgage - Servicer - 4444', value: '$210,000 | $1,750 | No | No' }
          ]
        }
      ];
    }

    const bytes = await generateStructuredPdfBuffer({
      title: 'Application Summary',
      template: 'application-summary',
      sections: [
        {
          heading: 'Loan overview',
          rows: [
            { label: 'Loan purpose', value: 'Purchase' },
            { label: 'Subject property', value: '17630 East 104th Place, Commerce City, CO 80022' },
            { label: 'Occupancy', value: 'PrimaryResidence' },
            { label: 'Unit count', value: '1' }
          ]
        },
        ...applicationSections('Jane Borrower', 1),
        ...applicationSections('John Borrower', 2)
      ]
    });
    const loaded = await PDFDocument.load(bytes);

    assert.equal(loaded.getPageCount(), 2);
  });
});
