'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

const { generateCreditInquiryPdfBuffer } = require('../../../lib/pdf/creditInquiryPdf');

test('generateCreditInquiryPdfBuffer', async (t) => {
  await t.test('produces a valid PDF from a full payload', async () => {
    const bytes = await generateCreditInquiryPdfBuffer({
      senderName: 'John Smith',
      coBorrowerName: 'Jane Smith',
      subjectPropertyAddress: '100 Pine St, Denver, CO 80202',
      loanNumber: 'LN-123',
      letterDate: 'April 15, 2026',
      inquiries: [
        {
          no: 1,
          inquiryDate: '2026-03-15',
          creditor: 'Rocket Mortgage',
          explanation: 'Shopping for mortgage — no new debt.'
        },
        {
          no: 2,
          inquiryDate: '2026-03-20',
          creditor: 'ABC Auto',
          explanation: 'Shopping for car — no new debt.'
        }
      ]
    });

    assert.ok(bytes instanceof Uint8Array);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
    const loaded = await PDFDocument.load(bytes);
    assert.ok(loaded.getPageCount() >= 1);
  });

  await t.test('produces a valid PDF from an empty payload', async () => {
    const bytes = await generateCreditInquiryPdfBuffer({});
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  });

  await t.test('paginates when there are many long inquiries', async () => {
    const explanation = 'This is an intentionally long explanation line. '.repeat(12);
    const inquiries = Array.from({ length: 20 }, (_, i) => ({
      no: i + 1,
      inquiryDate: '2026-03-15',
      creditor: `Creditor ${i + 1}`,
      explanation
    }));

    const bytes = await generateCreditInquiryPdfBuffer({
      senderName: 'John Smith',
      inquiries
    });

    const loaded = await PDFDocument.load(bytes);
    assert.ok(loaded.getPageCount() > 1, 'should produce more than one page');
  });
});
