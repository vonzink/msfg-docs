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
 *   { borrowers: [{ name, include }], borrowerNames, subjectPropertyAddress,
 *     loanNumber, letterDate, inquiries: [{ inquiryDate, creditor, explanation }] }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
function joinNames(names) {
  const a = (names || []).filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return a[0] + ' and ' + a[1];
  return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
}

async function generateCreditInquiryPdfBuffer(body) {
  const b = body || {};

  const sel = (Array.isArray(b.borrowers) ? b.borrowers : []).filter(function (x) { return x && x.name; });
  const names = sel.map(function (x) { return x.name; });
  const borrowerNames = b.borrowerNames || joinNames(names);

  const fields = [
    { label: 'Loan Number', value: b.loanNumber },
    { label: 'Borrower(s)', value: borrowerNames },
  ];
  fields.push({ label: 'Subject Property', value: b.subjectPropertyAddress, full: true });

  const inquiries = Array.isArray(b.inquiries) ? b.inquiries.filter(function (r) {
    return r && (r.inquiryDate || r.creditor || r.explanation);
  }) : [];

  // One blank signature line per selected borrower (name never pre-printed;
  // identity appears in the body via borrowerNames). Fallback to one line.
  const signatures = (names.length ? names : ['']).map(function (n) {
    return { caption: 'Signature', name: (n && String(n).trim()) || undefined };
  });

  const bodyBlocks = [
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
  ];
  // Optional free-text notes flow into the letter body.
  if (b.additionalNotes && String(b.additionalNotes).trim()) {
    bodyBlocks.push({ type: 'paragraph', text: String(b.additionalNotes).trim() });
  }

  return renderBorrowerLetter({
    eyebrow: 'Borrower Correspondence',
    title: 'Credit Inquiry Letter',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    fields,
    body: bodyBlocks,
    certify: 'I certify that the above information is true and correct to the best of my knowledge. Please let me know if any additional documentation is required.',
    signatures,
  }, b.letterSettings && b.letterSettings.templateStyle);
}

module.exports = { generateCreditInquiryPdfBuffer };
