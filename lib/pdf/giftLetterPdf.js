'use strict';

const { generateLetterPdfBuffer } = require('./letterPdf');

/**
 * Gift Letter PDF.
 *
 * Now delegates to lib/pdf/letterPdf.js so the four visual styles
 * (classic / modern / branded / compact) stay consistent across every
 * borrower-letter doc. Body content matches the LendingPad sample:
 * centered title, header rows, numbered "I, donor, certify..." list,
 * signature grid.
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateGiftLetterPdfBuffer(body) {
  const b = body || {};
  const style = String(b.letterStyle || 'classic').toLowerCase();

  const donorName = b.donorName || '\u2014';
  const giftAmount = b.giftAmount || '\u2014';
  const relationship = b.relationshipToDonor || '\u2014';
  const recipient = b.recipientName || '\u2014';
  const property = b.subjectPropertyAddress || '\u2014';
  const transferDate = b.fundTransferDate || '\u2014';
  const sourceOfGift = b.sourceOfGift || '\u2014';

  return generateLetterPdfBuffer({
    style,
    settings: b.letterSettings || null,
    title: 'Gift Letter',
    subtitle: 'For mortgage loan funds',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    headerRows: [
      { label: 'Loan Number', value: b.loanNumber },
      { label: 'Applicant(s)', value: b.recipientName },
      { label: 'Property Address', value: b.subjectPropertyAddress },
    ],
    body: [
      { type: 'paragraph', text: 'I, ' + donorName + ', do hereby certify the following:' },
      { type: 'ol', items: [
        'I have made a gift of ' + giftAmount + ' to ' + recipient + ', whose relationship is ' + relationship + '.',
        'This gift is to be applied towards the purchase of the property located at ' + property + '.',
        'No repayment of this gift is expected or implied in the form of cash or by future services of the recipient.',
        'The funds given to the homebuyer were not made available to the donor from any person or entity with an interest in the sale of the property including the seller, real estate agent or broker, builder, loan officer, or any entity associated with them.',
        'The source of this gift is ' + sourceOfGift + '.',
        'The date the funds were transferred: ' + transferDate + '.',
      ] },
      { type: 'heading', text: 'Donor information' },
      { type: 'table', rows: [
        { label: 'Donor name', value: b.donorName },
        { label: 'Relationship', value: b.relationshipToDonor },
        { label: 'Phone', value: b.donorPhone },
        { label: 'Email', value: b.donorEmail },
        { label: 'Address', value: b.donorAddress },
      ] },
    ],
    signatures: [
      { caption: 'Donor signature' },
      { caption: 'Recipient (borrower) signature' },
    ],
  });
}

module.exports = { generateGiftLetterPdfBuffer };
