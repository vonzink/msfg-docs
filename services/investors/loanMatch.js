'use strict';

function sanitizeMysqlIdent(s) {
  const x = String(s || '').replace(/[^a-zA-Z0-9_]/g, '');
  return x || '';
}

function rowMatchesDocJsonCol(row, col, loan) {
  const L = String(loan || '').trim().toLowerCase();
  if (!L) return false;
  const raw = row[col];
  if (!raw || typeof raw !== 'string') return false;
  const t = raw.trim();
  if (!t.startsWith('{')) return false;
  try {
    const j = JSON.parse(t);
    const keys = ['matchingLoanNumbers', 'matchingLoans', 'loanNumbers', 'losLoanNumbers'];
    for (let i = 0; i < keys.length; i++) {
      const arr = j[keys[i]];
      if (Array.isArray(arr) && arr.some((x) => String(x).trim().toLowerCase() === L)) return true;
    }
    if (j.matchingLoan && String(j.matchingLoan).trim().toLowerCase() === L) return true;
    if (j.loanNumber && String(j.loanNumber).trim().toLowerCase() === L) return true;
  } catch (_e) {
    /* ignore */
  }
  return false;
}

function rowMatchesDoc4506cJson(row, loan) {
  return rowMatchesDocJsonCol(row, 'doc_4506c', loan);
}

/**
 * @param {object} row - from DB; optional _loan_match_val when MYSQL_INVESTORS_LOAN_COLUMN is selected
 * @param {string} loan
 * @returns {boolean}
 */
function rowMatchesLoan(row, loan) {
  const L = String(loan || '').trim().toLowerCase();
  if (!L) return false;

  const col = sanitizeMysqlIdent(process.env.MYSQL_INVESTORS_LOAN_COLUMN || '');
  if (col) {
    if (row._loan_match_val == null || row._loan_match_val === '') return false;
    return String(row._loan_match_val).trim().toLowerCase() === L;
  }

  return rowMatchesDoc4506cJson(row, loan);
}

/**
 * Same loan-matching contract as rowMatchesLoan, but checks any of the
 * doc_* JSON columns (4506c, ssa, other). Used by the generic template
 * investor picker so a row configured for any doc type can still match.
 */
function rowMatchesAnyDocJson(row, loan) {
  const L = String(loan || '').trim().toLowerCase();
  if (!L) return false;

  const col = sanitizeMysqlIdent(process.env.MYSQL_INVESTORS_LOAN_COLUMN || '');
  if (col && row._loan_match_val != null && row._loan_match_val !== '') {
    if (String(row._loan_match_val).trim().toLowerCase() === L) return true;
  }

  const cols = ['doc_4506c', 'doc_ssa', 'doc_other'];
  for (let i = 0; i < cols.length; i++) {
    if (rowMatchesDocJsonCol(row, cols[i], loan)) return true;
  }
  return false;
}

function computeLoanMatches(rows, loan) {
  const L = String(loan || '').trim();
  if (!L) return { matchedIds: [], autoSelectId: null };

  const matchedIds = [];
  for (let i = 0; i < rows.length; i++) {
    if (rowMatchesLoan(rows[i], L)) matchedIds.push(rows[i].id);
  }

  const autoSelectId = matchedIds.length === 1 ? matchedIds[0] : null;
  return { matchedIds, autoSelectId };
}

function computeLoanMatchesAnyDoc(rows, loan) {
  const L = String(loan || '').trim();
  if (!L) return { matchedIds: [], autoSelectId: null };

  const matchedIds = [];
  for (let i = 0; i < rows.length; i++) {
    if (rowMatchesAnyDocJson(rows[i], L)) matchedIds.push(rows[i].id);
  }

  const autoSelectId = matchedIds.length === 1 ? matchedIds[0] : null;
  return { matchedIds, autoSelectId };
}

module.exports = {
  sanitizeMysqlIdent,
  rowMatchesLoan,
  // Kept for potential future reuse — was added for the now-removed generic
  // template investor flow but is a useful generic utility on its own.
  rowMatchesAnyDocJson,
  computeLoanMatches,
  computeLoanMatchesAnyDoc
};
