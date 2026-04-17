'use strict';

const { generateLetterPdfBuffer } = require('./letterPdf');

/**
 * Address Letter of Explanation PDF.
 * Delegates to the shared letter renderer for the 4 visual styles.
 *
 * Body shape:
 *   { borrowerName, loanNumber, currentAddress, letterDate,
 *     addresses: [{ address, dates, reason, explanation }],
 *     letterStyle }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateAddressLoxPdfBuffer(body) {
  const b = body || {};
  const style = String(b.letterStyle || 'classic').toLowerCase();

  const headerRows = [];
  if (b.loanNumber) headerRows.push({ label: 'Loan Number', value: b.loanNumber });
  if (b.borrowerName) headerRows.push({ label: 'Borrower', value: b.borrowerName });
  if (b.currentAddress) headerRows.push({ label: 'Current Address', value: b.currentAddress });

  const bodyContent = [];
  bodyContent.push({ type: 'paragraph', text: 'To Whom It May Concern,' });
  bodyContent.push({
    type: 'paragraph',
    text: 'I am writing to explain the address(es) that appear on my records. Each past or alternate residence is listed below along with the dates I lived there and the reason for any discrepancy.',
  });

  const addrs = Array.isArray(b.addresses) ? b.addresses.filter(function (r) {
    return r && (r.address || r.dates || r.reason || r.explanation);
  }) : [];

  if (addrs.length) {
    bodyContent.push({ type: 'heading', text: 'Addresses' });
    addrs.forEach(function (r, i) {
      const headerBits = [];
      if (r.address) headerBits.push(r.address);
      if (r.dates) headerBits.push('(' + r.dates + ')');
      if (headerBits.length) {
        bodyContent.push({ type: 'paragraph', text: (i + 1) + '. ' + headerBits.join(' ') });
      }
      if (r.reason) bodyContent.push({ type: 'paragraph', text: 'Reason: ' + r.reason });
      if (r.explanation) bodyContent.push({ type: 'paragraph', text: r.explanation });
    });
  }

  bodyContent.push({
    type: 'paragraph',
    text: 'I certify that the above information is true and correct to the best of my knowledge.',
  });

  return generateLetterPdfBuffer({
    style,
    settings: b.letterSettings || null,
    title: 'Address Letter of Explanation',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    headerRows,
    body: bodyContent,
    signatures: [{ caption: b.borrowerName || 'Borrower signature' }],
  });
}

module.exports = { generateAddressLoxPdfBuffer };
