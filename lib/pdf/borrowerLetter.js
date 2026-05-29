'use strict';

/**
 * Borrower-letter style dispatcher.
 *
 * The four borrower-authored letters (Credit Inquiry, Address LOE, Gift
 * Letter, Generic LOE) all build the same structured `letter` payload and
 * hand it here. The user-chosen template style (A/B/C) selects the
 * renderer; every renderer consumes the identical payload, so generators
 * never branch on style themselves.
 *
 *   A — "Evergreen"       warm editorial, serif, bordered boxes
 *   B — "Compact Ledger"  cool mono+sans, teal accent, hairline ribbon
 *   C — "Plain"           traditional serif business letter, monochrome
 */

const { generateBorrowerLetterPdfBuffer } = require('./borrowerLetterPdf');
const { generateBorrowerLetterPdfBufferB } = require('./borrowerLetterPdfB');
const { generateBorrowerLetterPdfBufferC } = require('./borrowerLetterPdfC');

/** Coerce any incoming style hint to a known style id, defaulting to A. */
function normalizeStyle(style) {
  const s = String(style == null ? '' : style).trim().toUpperCase();
  return (s === 'B' || s === 'C') ? s : 'A';
}

/**
 * @param {object} letter  structured borrower-letter payload
 * @param {string} [style] 'A' | 'B' | 'C' (case-insensitive; defaults to A)
 * @returns {Promise<Uint8Array>}
 */
function renderBorrowerLetter(letter, style) {
  switch (normalizeStyle(style)) {
    case 'B': return generateBorrowerLetterPdfBufferB(letter);
    case 'C': return generateBorrowerLetterPdfBufferC(letter);
    default: return generateBorrowerLetterPdfBuffer(letter);
  }
}

module.exports = { renderBorrowerLetter, normalizeStyle };
