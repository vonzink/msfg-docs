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

  // Opening paragraph: use the client-supplied (editable) text so the PDF
  // matches the preview exactly; fall back to a personalized default.
  const defaultIntro = 'I, ' + (borrowerNames || 'the borrower') +
    (b.loanNumber ? ' (Loan #' + b.loanNumber + ')' : '') +
    ', am writing to provide an explanation regarding the address(es) shown on my records.';
  const introText = (b.intro && String(b.intro).trim()) ? String(b.intro).trim() : defaultIntro;

  // "Dates Resided" is optional — drop the column entirely when no row has dates.
  const anyDates = rows.some(function (r) { return r.dates && String(r.dates).trim(); });
  const columns = [
    { header: '#', key: 'no', w: 0.06 },
    { header: 'Address on Record', key: 'address', w: anyDates ? 0.32 : 0.42, brand: true },
  ];
  if (anyDates) columns.push({ header: 'Dates Resided', key: 'dates', w: 0.18 });
  columns.push({ header: 'Reason / Explanation', key: 'detail', w: anyDates ? 0.44 : 0.52 });

  return renderBorrowerLetter({
    eyebrow: 'Borrower Correspondence',
    title: 'Address Letter of Explanation',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    fields,
    body: [
      { type: 'paragraph', text: 'To Whom It May Concern,' },
      { type: 'paragraph', text: introText },
      {
        type: 'dataTable',
        minRows: 3,
        columns: columns,
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
