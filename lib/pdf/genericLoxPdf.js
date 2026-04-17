'use strict';

const { generateLetterPdfBuffer } = require('./letterPdf');

/**
 * Generic Letter of Explanation PDF.
 * Delegates to lib/pdf/letterPdf.js — the four visual styles
 * (classic / modern / branded / compact) come from there.
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateGenericLoxPdfBuffer(body) {
  const b = body || {};
  const style = String(b.letterStyle || 'classic').toLowerCase();

  const headerRows = [
    { label: 'Loan Number', value: b.loanNumber },
    { label: 'Borrower(s)', value: b.borrowerNames },
    { label: 'Property Address', value: b.subjectPropertyAddress },
  ];
  if (b.topic && String(b.topic).trim()) {
    headerRows.push({ label: 'Subject', value: b.topic });
  }

  const bodyContent = [];
  bodyContent.push({ type: 'heading', text: 'Explanation' });
  bodyContent.push({ type: 'paragraph', text: b.explanation || '' });
  bodyContent.push({
    type: 'paragraph',
    text: 'I certify that the above information is true and correct to the best of my knowledge.',
  });

  const rawSigners = Array.isArray(b.signers) ? b.signers : [];
  const signatures = (rawSigners.length ? rawSigners : [{}, {}])
    .slice(0, 5)
    .map(function (s, i) {
      return { caption: (s && s.name) ? String(s.name) : ('Borrower ' + (i + 1) + ' signature') };
    });

  return generateLetterPdfBuffer({
    style,
    settings: b.letterSettings || null,
    title: 'Letter of Explanation',
    subtitle: 'Borrower attestation',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    headerRows,
    body: bodyContent,
    signatures,
  });
}

module.exports = { generateGenericLoxPdfBuffer };
