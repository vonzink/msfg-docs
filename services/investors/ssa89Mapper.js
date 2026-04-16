'use strict';

/**
 * Map an `investors` row to SSA-89 worksheet field ids.
 *
 * The `doc_ssa` column may hold either:
 *   - free text (used as Company name fallback), OR
 *   - JSON shaped like:
 *       {
 *         "label": "Optional dropdown label",
 *         "fields": { "sSsaCompanyName": "...", "sSsaCompanyAddress": "...",
 *                     "sSsaAgentName": "...", "sSsaAgentAddress": "...",
 *                     "sSsaValidFor": "60" },
 *         "company": { "name": "...", "address": "..." },
 *         "agent":   { "name": "...", "address": "..." },
 *         "validFor": 60,
 *         "matchingLoanNumbers": ["LP-123"]
 *       }
 *
 * `doc_mailing_address` is used as a fallback for company address.
 */

function ssaListLabel(row) {
  const raw = row.doc_ssa;
  if (raw && typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        const j = JSON.parse(t);
        if (j.label) return String(j.label).trim().slice(0, 120);
        if (j.displayName) return String(j.displayName).trim().slice(0, 120);
        if (j.company && j.company.name) return String(j.company.name).trim().slice(0, 120);
        if (j.fields && j.fields.sSsaCompanyName) return String(j.fields.sSsaCompanyName).trim().slice(0, 120);
      } catch (_e) { /* fall through */ }
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
  const raw = row.doc_ssa;

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
        if (j.company && typeof j.company === 'object') {
          if (j.company.name && !fields.sSsaCompanyName) fields.sSsaCompanyName = String(j.company.name);
          if (j.company.address && !fields.sSsaCompanyAddress) fields.sSsaCompanyAddress = String(j.company.address);
        }
        if (j.agent && typeof j.agent === 'object') {
          if (j.agent.name && !fields.sSsaAgentName) fields.sSsaAgentName = String(j.agent.name);
          if (j.agent.address && !fields.sSsaAgentAddress) fields.sSsaAgentAddress = String(j.agent.address);
        }
        if (j.validFor != null && !fields.sSsaValidFor) fields.sSsaValidFor = String(j.validFor);
      } catch (_e) { /* plain text */ }
    }
    if (!fields.sSsaCompanyName && t && !t.startsWith('{')) {
      fields.sSsaCompanyName = t.split(/\r?\n/)[0].trim().slice(0, 500);
    }
  }

  const mail = row.doc_mailing_address != null ? String(row.doc_mailing_address).trim() : '';
  if (mail && !fields.sSsaCompanyAddress) fields.sSsaCompanyAddress = mail;

  return fields;
}

module.exports = { ssaListLabel, mapRowToFormFields };
