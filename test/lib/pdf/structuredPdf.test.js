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

  await t.test('renders application summary sessions as one portrait letter review sheet per application', async () => {
    const bytes = await generateStructuredPdfBuffer({
      title: 'Application Summary',
      template: 'application-summary-session',
      loanOverview: {
        columns: ['Field', 'Value', 'Field', 'Value'],
        rows: [
          ['Borrower(s)', 'Jane Borrower, John Borrower', 'Subject property', '17630 East 104th Place, Commerce City, CO 80022'],
          ['Occupancy', 'PrimaryResidence', 'Units', '1'],
          ['Loan purpose', 'Purchase', 'Mortgage type', 'Conventional']
        ]
      },
      applications: ['Jane Borrower', 'John Borrower'].map((name, index) => ({
        borrowerName: name,
        label: `Application ${index + 1} of 2`,
        coverage: {
          residence: 'Complete - 2 years listed',
          employment: 'Complete - 2 years listed',
          reviewItems: index === 0 ? 'None' : 'Employment: Confirm prior employer dates.'
        },
        tables: {
          borrowerInformation: {
            columns: ['Name', 'Role', 'SSN/ITIN', 'DOB', 'Citizenship', 'Marital', 'Dependents', 'Phones', 'Email', 'AKA'],
            rows: [[name, index === 0 ? 'Borrower' : 'Cosigner', '***-**-1234', '1980-01-01', 'USCitizen', 'Married', '2', '(555) 111-2222', 'borrower@example.com', '']]
          },
          residenceHistory: {
            columns: ['Type', 'Address', 'Duration', 'Start', 'End'],
            rows: [
              ['Current', '100 Current Street, Denver, CO 80202', '1 yr', '2025-01-01', ''],
              ['Prior', '200 Prior Avenue, Aurora, CO 80010', '1 yr', '2024-01-01', '2024-12-31']
            ]
          },
          employmentHistory: {
            columns: ['Type', 'Employer', 'Title', 'Duration', 'Start', 'End', 'Monthly income'],
            rows: [
              ['Current', 'Current Employer', 'Analyst', '1 yr', '2025-01-01', '', '$4,500'],
              ['Previous', 'Prior Employer', 'Assistant', '1 yr', '2024-01-01', '2024-12-31', '']
            ]
          },
          assets: {
            columns: ['Type', 'Institution / account', 'Value', 'Usage', 'Disposition'],
            rows: [['CheckingAccount', 'Bank One', '$5,000', '', '']]
          },
          reo: {
            columns: ['Address', 'Usage', 'Value', 'Lien UPB', 'Net rental', 'Maintenance', 'Disposition'],
            rows: [['300 Rental Lane, Denver, CO', 'Investment', '$300,000', '$210,000', '$500', '$100', 'Keep']]
          },
          liabilities: {
            columns: ['Type', 'Creditor', 'Account', 'Balance', 'Payment', 'Paid off at closing', 'Excluded'],
            rows: [
              ['CreditCard', 'Card One', '1111', '$1,200', '$40', 'No', 'No'],
              ['Installment', 'Auto Lender', '2222', '$14,000', '$420', 'No', 'No']
            ]
          },
          declarations: {
            columns: ['Occupy', 'Seller relationship', 'Borrowed funds', 'New credit', 'Other mortgage', 'Judgments', 'Federal debt delinquent', 'Lawsuit', 'Bankruptcy', 'Foreclosure', 'Short sale'],
            rows: [['Yes', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No']]
          }
        }
      }))
    });
    const loaded = await PDFDocument.load(bytes);
    const size = loaded.getPage(0).getSize();

    assert.equal(loaded.getPageCount(), 2);
    assert.equal(size.width, 612);
    assert.equal(size.height, 792);
    assert.ok(size.height > size.width, 'application session pages should be portrait letter');
  });

  await t.test('renders legacy application summary section sessions as one page per application', async () => {
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
        { heading: `Residence history - ${name}`, rows: [{ label: 'Current - 1 year', value: '100 Current Street, Denver, CO 80202' }] },
        { heading: `Employment history - ${name}`, rows: [{ label: 'Current - 1 year', value: 'Current Employer - Analyst' }] },
        { heading: `Financial assets - ${name}`, rows: [{ label: 'Checking - Bank One', value: '$5,000 | Checking account' }] },
        { heading: `Liabilities - ${name}`, rows: [{ label: 'CreditCard - Card One - 1111', value: '$1,200 | $40 | No | No' }] }
      ]
    }

    const bytes = await generateStructuredPdfBuffer({
      title: 'Application Summary',
      template: 'application-summary',
      sections: [
        { heading: 'Loan overview', rows: [{ label: 'Loan purpose', value: 'Purchase' }] },
        ...applicationSections('Jane Borrower', 1),
        ...applicationSections('John Borrower', 2)
      ]
    });
    const loaded = await PDFDocument.load(bytes);

    assert.equal(loaded.getPageCount(), 2);
  });
});
