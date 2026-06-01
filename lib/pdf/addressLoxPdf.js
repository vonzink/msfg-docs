'use strict';

const { renderBorrowerLetter } = require('./borrowerLetter');

/**
 * Address Letter of Explanation PDF.
 *
 * Borrower-authored, so it uses the redesigned borrower-letter renderer
 * (no lender letterhead): masthead, identification grid, intro, a numbered
 * address table, certify line, and a borrower signature.
 *
 * Body shape:
 *   { borrowers: [{ name, include }], borrowerNames, loanNumber, currentAddress,
 *     letterDate, addresses: [{ address, dates, reason, explanation }] }
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

async function generateAddressLoxPdfBuffer(body) {
  const b = body || {};

  const sel = (Array.isArray(b.borrowers) ? b.borrowers : []).filter(function (x) { return x && x.name; });
  const names = sel.map(function (x) { return x.name; });
  const borrowerNames = b.borrowerNames || joinNames(names);

  const fields = [
    { label: 'Loan Number', value: b.loanNumber },
    { label: 'Borrower(s)', value: borrowerNames },
    { label: 'Current Address', value: b.currentAddress, full: true },
  ];

  const rows = (Array.isArray(b.addresses) ? b.addresses : [])
    .filter(function (r) { return r && (r.address || r.dates || r.reason || r.explanation); })
    .map(function (r) {
      const detail = [r.reason, r.explanation].filter(Boolean).join(' - ');
      return { address: r.address, dates: r.dates, detail: detail };
    });

  return renderBorrowerLetter({
    eyebrow: 'Borrower Correspondence',
    title: 'Address Letter of Explanation',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    fields,
    body: [
      { type: 'paragraph', text: 'To Whom It May Concern,' },
      {
        type: 'paragraph',
        text: 'I am writing to explain the addresses that appear on my records. Each past or alternate residence is listed below along with the dates I resided there and the reason for any discrepancy.',
      },
      {
        type: 'dataTable',
        minRows: 3,
        columns: [
          { header: '#', key: 'no', w: 0.06 },
          { header: 'Address on Record', key: 'address', w: 0.32, brand: true },
          { header: 'Dates Resided', key: 'dates', w: 0.18 },
          { header: 'Reason / Explanation', key: 'detail', w: 0.44 },
        ],
        rows: rows,
      },
    ],
    certify: 'I certify that the above information is true and correct to the best of my knowledge.',
    // One blank signature line per selected borrower (name never pre-printed;
    // identity appears in the body via borrowerNames). Fallback to one line.
    signatures: (names.length ? names : ['']).map(function (n) {
      return { caption: 'Signature', name: (n && String(n).trim()) || undefined };
    }),
  }, b.letterSettings && b.letterSettings.templateStyle);
}

module.exports = { generateAddressLoxPdfBuffer };
