'use strict';

/**
 * Generic investor → template field mapper.
 *
 * Returns canonical investor fields keyed for template prepopulation, drawn
 * from any of the existing investor JSON columns so existing rows configured
 * for SSA-89 / 4506-C also work for arbitrary user-uploaded templates.
 *
 * Read order per output field (first non-empty wins):
 *   1. doc_other JSON  — explicit per-investor template config
 *      { label, companyName, companyAddress, agentName, agentAddress,
 *        mailingAddress, phone, email, caf, validFor, matchingLoanNumbers,
 *        company:{name,address}, agent:{name,address} }
 *   2. doc_ssa JSON    — SSA-89 config (company.name/address, agent.name/address, validFor)
 *   3. doc_4506c JSON  — 4506-C config (thirdParty.name/address/caf)
 *   4. doc_mailing_address (text) — fallback for companyAddress / mailingAddress
 *
 * Output keys (matched 1:1 by the editor "Investor record" dropdown):
 *   companyName, companyAddress, agentName, agentAddress, mailingAddress,
 *   phone, email, caf, validFor
 */

function tryParseJson(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  try { return JSON.parse(t); } catch (_e) { return null; }
}

function pickString() {
  for (let i = 0; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return '';
}

function templateListLabel(row) {
  const other = tryParseJson(row.doc_other);
  const ssa = tryParseJson(row.doc_ssa);
  const f4506 = tryParseJson(row.doc_4506c);

  const label = pickString(
    other && other.label,
    other && other.displayName,
    other && other.companyName,
    other && other.company && other.company.name,
    ssa && ssa.label,
    ssa && ssa.displayName,
    ssa && ssa.company && ssa.company.name,
    ssa && ssa.fields && ssa.fields.sSsaCompanyName,
    f4506 && f4506.label,
    f4506 && f4506.displayName,
    f4506 && f4506.thirdParty && f4506.thirdParty.name,
    f4506 && f4506.fields && f4506.fields.f4506ThirdPartyName,
    row.doc_mailing_address && String(row.doc_mailing_address).split(',')[0],
    'Investor #' + row.id
  );
  return label.slice(0, 120);
}

function mapRowToTemplateFields(row) {
  const out = {};
  const other = tryParseJson(row.doc_other) || {};
  const ssa = tryParseJson(row.doc_ssa) || {};
  const f4506 = tryParseJson(row.doc_4506c) || {};
  const mail = pickString(row.doc_mailing_address);

  out.companyName = pickString(
    other.companyName,
    other.company && other.company.name,
    ssa.company && ssa.company.name,
    ssa.fields && ssa.fields.sSsaCompanyName,
    f4506.thirdParty && f4506.thirdParty.name,
    f4506.fields && f4506.fields.f4506ThirdPartyName
  );
  out.companyAddress = pickString(
    other.companyAddress,
    other.company && other.company.address,
    ssa.company && ssa.company.address,
    ssa.fields && ssa.fields.sSsaCompanyAddress,
    f4506.thirdParty && f4506.thirdParty.address,
    f4506.fields && f4506.fields.f4506ThirdPartyAddress,
    mail
  );
  out.agentName = pickString(
    other.agentName,
    other.agent && other.agent.name,
    ssa.agent && ssa.agent.name,
    ssa.fields && ssa.fields.sSsaAgentName
  );
  out.agentAddress = pickString(
    other.agentAddress,
    other.agent && other.agent.address,
    ssa.agent && ssa.agent.address,
    ssa.fields && ssa.fields.sSsaAgentAddress
  );
  out.mailingAddress = pickString(other.mailingAddress, mail);
  out.phone = pickString(other.phone, other.phoneNumber, other.contactPhone);
  out.email = pickString(other.email, other.contactEmail);
  out.caf = pickString(
    other.caf,
    f4506.thirdParty && f4506.thirdParty.caf,
    f4506.fields && f4506.fields.f4506ThirdPartyCaf
  );
  out.validFor = pickString(
    other.validFor,
    ssa.validFor,
    ssa.fields && ssa.fields.sSsaValidFor
  );

  // Strip empty values to keep the payload small.
  Object.keys(out).forEach((k) => { if (!out[k]) delete out[k]; });
  return out;
}

module.exports = { templateListLabel, mapRowToTemplateFields };
