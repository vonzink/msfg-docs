'use strict';

const { generateLetterPdfBuffer } = require('./letterPdf');

/**
 * Credit Inquiry Letter PDF — now goes through the shared letter
 * renderer so the 4 visual styles (classic / modern / branded /
 * compact) apply the same way as the other borrower-letter docs.
 *
 * Body shape (same as before):
 *   { senderName, coBorrowerName, subjectPropertyAddress, loanNumber,
 *     letterDate, inquiries: [{ no, inquiryDate, creditor, explanation }],
 *     letterStyle }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateCreditInquiryPdfBuffer(body) {
  const b = body || {};
  const style = String(b.letterStyle || 'classic').toLowerCase();

  const headerRows = [
    { label: 'Loan Number', value: b.loanNumber },
    { label: 'Sender', value: b.senderName },
  ];
  if (b.coBorrowerName) headerRows.push({ label: 'Co-borrower', value: b.coBorrowerName });
  if (b.subjectPropertyAddress) headerRows.push({ label: 'Subject Property', value: b.subjectPropertyAddress });

  const bodyContent = [];
  bodyContent.push({ type: 'paragraph', text: 'To Whom It May Concern,' });
  bodyContent.push({
    type: 'paragraph',
    text: 'I am writing to request an explanation regarding the following recent credit inquiries that appear on my credit report. Each inquiry is listed below along with my explanation of the circumstances.',
  });

  const inquiries = Array.isArray(b.inquiries) ? b.inquiries : [];
  if (inquiries.length) {
    bodyContent.push({ type: 'heading', text: 'Inquiries' });
    inquiries.forEach(function (row, i) {
      const header = [
        row.inquiryDate ? 'Date: ' + row.inquiryDate : null,
        row.creditor ? 'Creditor: ' + row.creditor : null,
      ].filter(Boolean).join('  |  ');
      if (header) bodyContent.push({ type: 'paragraph', text: (i + 1) + '. ' + header });
      if (row.explanation) bodyContent.push({ type: 'paragraph', text: row.explanation });
    });
  }

  bodyContent.push({
    type: 'paragraph',
    text: 'I certify that the above information is true and correct to the best of my knowledge. Please let me know if any additional documentation is required.',
  });

  return generateLetterPdfBuffer({
    style,
    title: 'Credit Inquiry Letter',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    headerRows,
    body: bodyContent,
    signatures: b.senderName
      ? [{ caption: b.senderName }, ...(b.coBorrowerName ? [{ caption: b.coBorrowerName }] : [])]
      : [{ caption: 'Borrower signature' }],
  });
}

module.exports = { generateCreditInquiryPdfBuffer };
