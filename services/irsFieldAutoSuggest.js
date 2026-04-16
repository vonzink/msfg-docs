'use strict';

/**
 * Auto-suggest MISMO source mappings for IRS form AcroForm fields.
 *
 * The IRS publishes 4506-C and SSA-89 with deterministic AcroForm field
 * names. When an investor uploads a copy of one of these, every PDF will
 * have the same field paths under
 *   form1[0].page_1[0].name_shown[0].first_name[0]
 *   form1[0].page_1[0].current_name_address[0].street_address[0]
 *   ...
 *
 * On first open of a dashboard-sourced doc tagged form-4506c or form-ssa89,
 * we pre-populate the editor's "Auto-fill source" dropdown with the
 * canonical mapping below so the user mostly clicks Save instead of
 * mapping 30+ fields by hand. The user can override any suggestion before
 * saving.
 *
 * Heuristic: simple lowercase substring match on the trailing field name
 * segment (everything after the last '.'). That keeps the table small and
 * resilient to slight namespacing differences between PDF generations.
 */

/** Map of (substring → mismo-prefixed source). First match wins per field. */
const PATTERNS_4506C = [
  // Borrower (line 1)
  { match: 'name_shown.first_name',           source: 'mismo:borrowerName' },
  { match: 'name_shown.last_name',            source: 'mismo:borrowerName' },
  { match: 'name_shown.first_ssn',            source: 'mismo:borrowerTin' },
  // Joint (line 2)
  { match: 'if_a_joint.first_name',           source: 'mismo:coBorrowerName' },
  { match: 'if_a_joint.last_name',            source: 'mismo:coBorrowerName' },
  { match: 'if_a_joint.second_ssn',           source: 'mismo:spouseTin' },
  // Current address (line 3)
  { match: 'current_name_address.street_address', source: 'mismo:currentResidenceLine' },
  { match: 'current_name_address.city',           source: 'mismo:currentResidenceCity' },
  { match: 'current_name_address.state',          source: 'mismo:currentResidenceState' },
  { match: 'current_name_address.zip_code',       source: 'mismo:currentResidencePostal' },
  // Previous address (line 4)
  { match: 'previous_address_shown.street_address', source: 'mismo:priorResidenceLine' },
  { match: 'previous_address_shown.city',           source: 'mismo:priorResidenceCity' },
  { match: 'previous_address_shown.state',          source: 'mismo:priorResidenceState' },
  { match: 'previous_address_shown.zip_code',       source: 'mismo:priorResidencePostal' },
];

const PATTERNS_SSA89 = [
  { match: 'p1_printedname',  source: 'mismo:borrowerName' },
  { match: 'printed_name',    source: 'mismo:borrowerName' },
  { match: 'p1_dob',          source: 'mismo:borrowerBirthDate' },
  { match: 'date_of_birth',   source: 'mismo:borrowerBirthDate' },
  { match: 'p1_ssn',          source: 'mismo:borrowerTin' },
  { match: 'ssn',             source: 'mismo:borrowerTin' },
];

function suggestForField(pdfFieldName, docType) {
  if (!pdfFieldName) return '';
  const lower = String(pdfFieldName).toLowerCase();
  let table = [];
  if (docType === 'form-4506c') table = PATTERNS_4506C;
  else if (docType === 'form-ssa89') table = PATTERNS_SSA89;
  else return '';

  for (const { match, source } of table) {
    if (lower.indexOf(match) !== -1) return source;
  }
  return '';
}

/**
 * Walk an array of detected fields and stamp `source` on any that match
 * a known IRS pattern AND don't already have a user-set source. Mutates
 * in place; returns the same array for convenience.
 */
function applySuggestions(fields, docType) {
  if (!Array.isArray(fields)) return fields;
  if (docType !== 'form-4506c' && docType !== 'form-ssa89') return fields;
  fields.forEach((f) => {
    if (f.source || f.mismoPath) return; // user already set something
    const s = suggestForField(f.pdfField, docType);
    if (s) f.source = s;
  });
  return fields;
}

module.exports = { suggestForField, applySuggestions };
