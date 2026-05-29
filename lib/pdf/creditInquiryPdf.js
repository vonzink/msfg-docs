'use strict';

const { renderBorrowerLetter } = require('./borrowerLetter');

/**
 * Credit Inquiry Letter PDF.
 *
 * Borrower-authored ("To Whom It May Concern") so it carries no lender
 * letterhead — it uses the redesigned borrower-letter renderer: masthead,
 * identification grid, intro, a numbered inquiry table, certify line, and
 * borrower signatures.
 *
 * Body shape:
 *   { senderName, coBorrowerName, subjectPropertyAddress, loanNumber,
 *     letterDate, inquiries: [{ inquiryDate, creditor, explanation }] }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateCreditInquiryPdfBuffer(body) {
  const b = body || {};

  const fields = [
    { label: 'Loan Number', value: b.loanNumber },
    { label: 'Sender', value: b.senderName },
  ];
  if (b.coBorrowerName) fields.push({ label: 'Co-borrower', value: b.coBorrowerName });
  fields.push({ label: 'Subject Property', value: b.subjectPropertyAddress, full: true });

  const inquiries = Array.isArray(b.inquiries) ? b.inquiries.filter(function (r) {
    return r && (r.inquiryDate || r.creditor || r.explanation);
  }) : [];

  const signatures = [{ caption: 'Signature', name: b.senderName }];
  if (b.coBorrowerName) signatures.push({ caption: 'Co-borrower Signature', name: b.coBorrowerName });

  return renderBorrowerLetter({
    eyebrow: 'Borrower Correspondence',
    title: 'Credit Inquiry Letter',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    fields,
    body: [
      { type: 'paragraph', text: 'To Whom It May Concern,' },
      {
        type: 'paragraph',
        text: 'I am writing to provide an explanation for the following credit inquiries that appear on my credit report. Each inquiry is listed below with the date, the inquiring party, and the circumstances surrounding it.',
      },
      {
        type: 'dataTable',
        minRows: 3,
        columns: [
          { header: '#', key: 'no', w: 0.07 },
          { header: 'Date of Inquiry', key: 'inquiryDate', w: 0.20 },
          { header: 'Inquiring Party', key: 'creditor', w: 0.28, brand: true },
          { header: 'Explanation', key: 'explanation', w: 0.45 },
        ],
        rows: inquiries,
      },
    ],
    certify: 'I certify that the above information is true and correct to the best of my knowledge. Please let me know if any additional documentation is required.',
    signatures,
  }, b.letterSettings && b.letterSettings.templateStyle);
}

module.exports = { generateCreditInquiryPdfBuffer };
