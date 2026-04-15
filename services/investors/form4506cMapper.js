'use strict';

/**
 * Map `investors` row columns (doc_4506c, doc_mailing_address, doc_ssa, doc_other)
 * to Form 4506-C worksheet field ids. Admin can store JSON in doc_4506c, for example:
 * { "label": "…", "fields": { "f4506ThirdPartyName": "…" }, "thirdParty": { "name", "address", "caf" },
 *   "matchingLoanNumbers": ["LP-123", "ABC-9"] }
 * MISMO loan number auto-match uses MYSQL_INVESTORS_LOAN_COLUMN or matchingLoanNumbers / matchingLoan / loanNumber in JSON.
 */

function investorListLabel(row) {
  const raw = row.doc_4506c;
  if (raw && typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        const j = JSON.parse(t);
        if (j.label) return String(j.label).trim();
        if (j.displayName) return String(j.displayName).trim();
        if (j.thirdParty && j.thirdParty.name) return String(j.thirdParty.name).trim();
        if (j.fields && j.fields.f4506ThirdPartyName) return String(j.fields.f4506ThirdPartyName).trim();
      } catch (e) {
        /* fall through */
      }
    }
    if (t && !t.startsWith('{')) {
      const line = t.split(/\r?\n/)[0].trim();
      if (line) return line.slice(0, 120);
    }
  }
  if (row.doc_mailing_address && String(row.doc_mailing_address).trim()) {
    const m = String(row.doc_mailing_address).trim().split(',')[0];
    if (m) return m.slice(0, 120);
  }
  return `Investor #${row.id}`;
}

function mapRowToFormFields(row) {
  const fields = {};
  const raw = row.doc_4506c;
  if (raw && typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        const j = JSON.parse(t);
        if (j.fields && typeof j.fields === 'object') {
          Object.keys(j.fields).forEach((k) => {
            if (j.fields[k] != null && j.fields[k] !== '') fields[k] = String(j.fields[k]);
          });
        }
        if (j.f4506ThirdPartyName) fields.f4506ThirdPartyName = String(j.f4506ThirdPartyName);
        if (j.f4506ThirdPartyAddress) fields.f4506ThirdPartyAddress = String(j.f4506ThirdPartyAddress);
        if (j.f4506ThirdPartyCaf) fields.f4506ThirdPartyCaf = String(j.f4506ThirdPartyCaf);
        if (j.thirdParty && typeof j.thirdParty === 'object') {
          if (j.thirdParty.name && !fields.f4506ThirdPartyName) fields.f4506ThirdPartyName = String(j.thirdParty.name);
          if (j.thirdParty.address && !fields.f4506ThirdPartyAddress) {
            fields.f4506ThirdPartyAddress = String(j.thirdParty.address);
          }
          if (j.thirdParty.caf && !fields.f4506ThirdPartyCaf) fields.f4506ThirdPartyCaf = String(j.thirdParty.caf);
        }
      } catch (e) {
        /* plain text */
      }
    }
    if (!fields.f4506ThirdPartyName && t && !t.startsWith('{')) {
      fields.f4506ThirdPartyName = t.split(/\r?\n/)[0].trim().slice(0, 500);
    }
  }

  const mail = row.doc_mailing_address != null ? String(row.doc_mailing_address).trim() : '';
  if (mail && !fields.f4506ThirdPartyAddress) fields.f4506ThirdPartyAddress = mail;

  const extras = [];
  if (row.doc_ssa != null && String(row.doc_ssa).trim()) extras.push('SSA (investor): ' + String(row.doc_ssa).trim());
  if (row.doc_other != null && String(row.doc_other).trim()) extras.push('Other (investor): ' + String(row.doc_other).trim());
  if (extras.length) {
    const block = extras.join('\n');
    if (fields.f4506Notes) fields.f4506Notes = fields.f4506Notes + '\n' + block;
    else fields.f4506Notes = block;
  }

  return fields;
}

module.exports = { investorListLabel, mapRowToFormFields };
