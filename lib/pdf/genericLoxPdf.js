'use strict';

const { renderBorrowerLetter } = require('./borrowerLetter');

/**
 * Generic Letter of Explanation PDF.
 *
 * Borrower-authored, so it uses the redesigned borrower-letter renderer
 * (no lender letterhead): masthead, identification grid, a ruled
 * explanation box, certify line, and signer signature rows.
 *
 * Body shape:
 *   { loanNumber, borrowerNames, subjectPropertyAddress, topic,
 *     explanation, signers: [{ name }], letterDate }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateGenericLoxPdfBuffer(body) {
  const b = body || {};

  const fields = [
    { label: 'Loan Number', value: b.loanNumber },
    { label: 'Borrower(s)', value: b.borrowerNames },
    { label: 'Property Address', value: b.subjectPropertyAddress, full: true },
  ];
  if (b.topic && String(b.topic).trim()) {
    fields.push({ label: 'Subject', value: b.topic, full: true });
  }

  const rawSigners = (Array.isArray(b.borrowers) && b.borrowers.length
    ? b.borrowers
    : (Array.isArray(b.signers) ? b.signers : [])).slice(0, 8);
  // Blank signature lines — the borrower's identity already appears in the
  // body via borrowerNames; signature lines are printed for wet signing.
  const signatures = (rawSigners.length ? rawSigners : [{}]).map(function () {
    return { caption: 'Signature', name: undefined };
  });

  return renderBorrowerLetter({
    eyebrow: 'Borrower Attestation',
    title: 'Letter of Explanation',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    fields,
    body: [
      { type: 'paragraph', text: 'To Whom It May Concern,' },
      { type: 'explanationBox', heading: 'Explanation', text: b.explanation },
    ],
    certify: 'I certify that the above information is true and correct to the best of my knowledge.',
    signatures,
  }, b.letterSettings && b.letterSettings.templateStyle);
}

module.exports = { generateGenericLoxPdfBuffer };
