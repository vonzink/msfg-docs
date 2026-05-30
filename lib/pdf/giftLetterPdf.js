'use strict';

const { renderBorrowerLetter } = require('./borrowerLetter');

/**
 * Gift Letter PDF.
 *
 * Borrower/donor-authored, so it uses the redesigned borrower-letter
 * renderer (no lender letterhead): masthead, identification grid, a
 * numbered certification list with inline fill-in values, a donor
 * information grid, and donor + recipient signature rows.
 *
 * Body shape:
 *   { donorName, giftAmount, relationshipToDonor, recipients, recipientNames,
 *     subjectPropertyAddress, fundTransferDate, sourceOfGift, loanNumber,
 *     donorPhone, donorEmail, donorAddress, letterDate }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateGiftLetterPdfBuffer(body) {
  const b = body || {};
  const v = function (x) { return { text: x, value: true }; };
  const t = function (x) { return { text: x }; };

  // Recipients (the loan's borrowers) drive one blank signature line each;
  // the donor signs separately. Signature lines are blank — never pre-print names.
  const recips = (Array.isArray(b.recipients) ? b.recipients : []).filter(function (x) { return x && x.name; });
  const signatures = [{ caption: 'Donor Signature', name: undefined }].concat(
    (recips.length ? recips : [{}]).map(function () { return { caption: 'Recipient (Borrower) Signature', name: undefined }; })
  );

  return renderBorrowerLetter({
    eyebrow: 'Mortgage Loan Funds',
    title: 'Gift Letter',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    fields: [
      { label: 'Loan Number', value: b.loanNumber },
      { label: 'Applicant(s)', value: b.recipientNames },
      { label: 'Property Address', value: b.subjectPropertyAddress, full: true },
    ],
    body: [
      {
        type: 'numberedList',
        intro: { runs: [t('I, '), v(b.donorName), t(', do hereby certify the following:')] },
        items: [
          [t('I have made a gift of '), v(b.giftAmount), t(' to '), v(b.recipientNames), t(', whose relationship to me is '), v(b.relationshipToDonor), t('.')],
          [t('This gift will be applied toward the purchase of the property located at '), v(b.subjectPropertyAddress), t('.')],
          [t('No repayment of this gift is expected or implied, either in cash or by future services of the recipient.')],
          [t('The funds given were not made available to the donor by any person or entity with an interest in the sale of the property, including the seller, real estate agent, broker, builder, or loan officer.')],
          [t('The source of this gift is '), v(b.sourceOfGift), t('.')],
          [t('The date the funds were transferred was '), v(b.fundTransferDate), t('.')],
        ],
      },
      {
        type: 'donorGrid',
        heading: 'Donor Information',
        cells: [
          { label: 'Donor Name', value: b.donorName },
          { label: 'Relationship', value: b.relationshipToDonor },
          { label: 'Phone', value: b.donorPhone },
          { label: 'Email', value: b.donorEmail },
          { label: 'Address', value: b.donorAddress, full: true },
        ],
      },
      // Optional free-text notes flow into the letter body.
      ...(b.additionalNotes && String(b.additionalNotes).trim()
        ? [{ type: 'paragraph', text: String(b.additionalNotes).trim() }]
        : []),
    ],
    signatures: signatures,
  }, b.letterSettings && b.letterSettings.templateStyle);
}

module.exports = { generateGiftLetterPdfBuffer };
