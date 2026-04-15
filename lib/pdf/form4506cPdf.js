'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const DEFAULT_TEMPLATE = path.join(__dirname, '../../public/documents/irs-form-4506-c.pdf');

/** IRS AcroForm paths (from pdf-lib field dump). */
const F = {
  primaryFirst: 'form1[0].page_1[0].name_shown[0].first_name[0]',
  primaryMi: 'form1[0].page_1[0].name_shown[0].middle_initial[0]',
  primaryLast: 'form1[0].page_1[0].name_shown[0].last_name[0]',
  primarySsn: 'form1[0].page_1[0].name_shown[0].first_ssn[0]',
  jointFirst: 'form1[0].page_1[0].if_a_joint[0].first_name[0]',
  jointMi: 'form1[0].page_1[0].if_a_joint[0].middle_initial[0]',
  jointLast: 'form1[0].page_1[0].if_a_joint[0].last_name[0]',
  jointSsn: 'form1[0].page_1[0].if_a_joint[0].second_ssn[0]',
  curStreet: 'form1[0].page_1[0].current_name_address[0].street_address[0]',
  curCity: 'form1[0].page_1[0].current_name_address[0].city[0]',
  curState: 'form1[0].page_1[0].current_name_address[0].state[0]',
  curZip: 'form1[0].page_1[0].current_name_address[0].zip_code[0]',
  prevStreet: 'form1[0].page_1[0].previous_address_shown[0].street_address[0]',
  prevCity: 'form1[0].page_1[0].previous_address_shown[0].city[0]',
  prevState: 'form1[0].page_1[0].previous_address_shown[0].state[0]',
  prevZip: 'form1[0].page_1[0].previous_address_shown[0].zip_code[0]',
  ivesName: 'form1[0].page_1[0].ives_participant_name[0].ives_participant_name[0]',
  ivesId: 'form1[0].page_1[0].ives_participant_name[0].ives_participant_id[0]',
  ivesSor: 'form1[0].page_1[0].ives_participant_name[0].sor_mailbox_id[0]',
  ivesStreet: 'form1[0].page_1[0].ives_participant_name[0].street_address[0]',
  ivesCity: 'form1[0].page_1[0].ives_participant_name[0].city[0]',
  ivesState: 'form1[0].page_1[0].ives_participant_name[0].state[0]',
  ivesZip: 'form1[0].page_1[0].ives_participant_name[0].zip_code[0]',
  customerFile: 'form1[0].page_1[0].customer_file_number[0]',
  uniqueId: 'form1[0].page_1[0].unique_identifer[0]',
  transcriptRequest: 'form1[0].page_1[0].transcript_reqeust[0]',
  transcriptReturn: 'form1[0].page_1[0].transcript_type[0].return_transcript[0]',
  transcriptAccount: 'form1[0].page_1[0].transcript_type[0].account_transcript[0]',
  transcriptRecord: 'form1[0].page_1[0].transcript_type[0].record_of_account[0]',
  formNum1: 'form1[0].page_1[0].#subform[9].form_number1[0]',
  formNum2: 'form1[0].page_1[0].#subform[9].form_number2[0]',
  formNum3: 'form1[0].page_1[0].#subform[9].form_number3[0]',
  // Line 8 "Year or period requested" — four date slots, each MM/DD/YYYY.
  q8Dates: [
    ['form1[0].page_1[0].question_8[0].f1_15[0]', 'form1[0].page_1[0].question_8[0].f1_16[0]', 'form1[0].page_1[0].question_8[0].f1_17[0]'],
    ['form1[0].page_1[0].question_8[0].f1_18[0]', 'form1[0].page_1[0].question_8[0].f1_19[0]', 'form1[0].page_1[0].question_8[0].f1_20[0]'],
    ['form1[0].page_1[0].question_8[0].f1_21[0]', 'form1[0].page_1[0].question_8[0].f1_22[0]', 'form1[0].page_1[0].question_8[0].f1_23[0]'],
    ['form1[0].page_1[0].question_8[0].f1_24[0]', 'form1[0].page_1[0].question_8[0].f1_25[0]', 'form1[0].page_1[0].question_8[0].f1_26[0]']
  ]
};

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'professor', 'rev', 'reverend', 'fr', 'sr', 'sra', 'hon', 'rabbi', 'imam']);
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'esq', 'phd', 'md', 'dds', 'dvm', 'cpa', 'rn', 'lpn']);

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC','AS','GU','MP','PR','VI'
]);

/** Strip leading/trailing dots and commas. */
function stripPunct(s) {
  return String(s || '').replace(/^[.,]+|[.,]+$/g, '');
}

/**
 * Split a full name into { first, mi, last }.
 * Handles:
 *   - "John Smith"              → first=John, last=Smith
 *   - "John A Smith"            → first=John, mi=A, last=Smith
 *   - "John A. Smith"           → first=John, mi=A, last=Smith
 *   - "Mary Jo Smith"           → first="Mary Jo", last=Smith  (no single-letter tail, no MI extracted)
 *   - "Dr. John Smith"          → first=John, last=Smith  (honorific stripped)
 *   - "John Smith Jr."          → first=John, last=Smith  (suffix stripped)
 *   - "John Smith, Jr."         → first=John, last=Smith
 *   - "Smith, John A"           → first=John, mi=A, last=Smith  (last-comma-first inverted)
 *   - ""                        → all empty
 */
function splitPersonName(full) {
  let s = String(full || '').trim();
  if (!s) return { first: '', mi: '', last: '' };

  // Last-comma-first form: "Smith, John A" or "Smith Jr., John A"
  // Only invert if there's exactly one comma and both sides are non-empty.
  const commaIdx = s.indexOf(',');
  if (commaIdx !== -1) {
    const lastPart = s.slice(0, commaIdx).trim();
    const restPart = s.slice(commaIdx + 1).trim();
    if (lastPart && restPart && !/,/.test(restPart)) {
      // Inversion is correct unless the "rest" is a suffix like "Jr."
      // (e.g. "John Smith, Jr." — not an inversion)
      const restTokens = restPart.split(/\s+/).map(stripPunct).filter(Boolean);
      const isSuffixOnly = restTokens.length > 0 && restTokens.every(t => SUFFIXES.has(t.toLowerCase()));
      if (!isSuffixOnly) {
        s = `${restPart} ${lastPart}`;
      } else {
        // "John Smith, Jr." — just drop the comma, suffix stripping handles the rest
        s = `${lastPart} ${restPart}`;
      }
    }
  }

  let parts = s.split(/\s+/).map(stripPunct).filter(Boolean);
  if (parts.length === 0) return { first: '', mi: '', last: '' };

  // Drop leading honorific (e.g. "Dr. John Smith" → "John Smith")
  if (parts.length > 1 && HONORIFICS.has(parts[0].toLowerCase())) {
    parts = parts.slice(1);
  }

  // Drop trailing suffix(es) (e.g. "John Smith Jr." → "John Smith")
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) return { first: '', mi: '', last: '' };
  if (parts.length === 1) return { first: parts[0].slice(0, 80), mi: '', last: '' };

  const last = parts[parts.length - 1];
  const firstMid = parts.slice(0, -1);

  let mi = '';
  let firstTokens = firstMid;
  // Only extract MI if there are 2+ first/mid tokens and the last one is a single letter
  if (firstMid.length >= 2) {
    const candidateMi = firstMid[firstMid.length - 1];
    if (/^[A-Za-z]$/.test(candidateMi)) {
      mi = candidateMi;
      firstTokens = firstMid.slice(0, -1);
    }
  }

  return {
    first: firstTokens.join(' ').slice(0, 80),
    mi: mi.slice(0, 1).toUpperCase(),
    last: last.slice(0, 80)
  };
}

function digitsOnly(s, max) {
  const d = String(s || '').replace(/\D/g, '');
  const m = max || 9;
  return d.slice(0, m);
}

/**
 * Parse a freeform US address into { street, city, state, zip }.
 * Works off the end of the string: peel off ZIP, then 2-letter state, then use
 * remaining commas to separate city from street.
 *
 * Handles:
 *   - "123 Main St, Denver, CO 80202"
 *   - "123 Main St, Suite 200, Denver, CO, 80202"    (extra comma between state and zip)
 *   - "PO Box 500, Chicago, IL 60601-1234"            (ZIP+4)
 *   - "Denver, CO 80202"                              (no street; treat as city-only)
 *   - "123 Main St"                                   (no zip/state; treat as street)
 *   - "456 Oak Ave Apt 4B, Seattle, WA"               (missing zip)
 */
function parseThirdPartyAddress(addr) {
  const s = String(addr || '').trim();
  if (!s) return { street: '', city: '', state: '', zip: '' };

  let rest = s;
  let zip = '';
  let state = '';

  // Peel ZIP (5 or 5+4) off the end, tolerating comma or whitespace separators.
  const zipMatch = rest.match(/^(.*?)[\s,]*(\d{5}(?:-\d{4})?)\s*$/);
  if (zipMatch) {
    zip = zipMatch[2];
    rest = zipMatch[1].trim().replace(/,\s*$/, '');
  }

  // Peel 2-letter state off the end, but only if it's a real US state code
  // (otherwise a street suffix like "St" would be misread as a state).
  const stateMatch = rest.match(/^(.*?)[\s,]+([A-Za-z]{2})\s*$/);
  if (stateMatch && US_STATES.has(stateMatch[2].toUpperCase())) {
    state = stateMatch[2].toUpperCase();
    rest = stateMatch[1].trim().replace(/,\s*$/, '');
  }

  const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);
  let street = '';
  let city = '';
  if (parts.length >= 2) {
    city = parts[parts.length - 1];
    street = parts.slice(0, -1).join(', ');
  } else if (parts.length === 1) {
    // If we successfully parsed state/zip, the single remaining part is the city.
    // Otherwise (no state, no zip) treat the whole thing as a street fragment.
    if (state || zip) city = parts[0];
    else street = parts[0];
  }

  return {
    street: street.slice(0, 500),
    city: city.slice(0, 100),
    state,
    zip
  };
}

function parsePrevAddress(oneLine) {
  const s = String(oneLine || '').trim();
  if (!s) return { street: '', city: '', state: '', zip: '' };
  return parseThirdPartyAddress(s);
}

function safeSetText(form, fieldName, text) {
  if (text == null || text === '') return;
  try {
    const tf = form.getTextField(fieldName);
    tf.setText(String(text).slice(0, 2000));
  } catch (_e) {
    /* missing or wrong type */
  }
}

function safeUncheck(form, fieldName) {
  try {
    form.getCheckBox(fieldName).uncheck();
  } catch (_e) { /* */ }
}

function safeCheck(form, fieldName) {
  try {
    form.getCheckBox(fieldName).check();
  } catch (_e) { /* */ }
}

function applyTranscriptType(form, transcriptType) {
  safeUncheck(form, F.transcriptReturn);
  safeUncheck(form, F.transcriptAccount);
  safeUncheck(form, F.transcriptRecord);
  const t = String(transcriptType || '').toLowerCase();
  if (t === 'return') safeCheck(form, F.transcriptReturn);
  else if (t === 'account') safeCheck(form, F.transcriptAccount);
  else if (t === 'record') safeCheck(form, F.transcriptRecord);
}

/**
 * Distribute a freeform tax-years string into 4 date slots (MM/DD/YYYY).
 * Accepts a mix of bare years ("2023") and explicit MM/DD/YYYY dates, separated by
 * commas, semicolons, or whitespace. Bare years become 12/31/YYYY (calendar year end).
 * Returns exactly 4 slots (empty slots are { mm:'', dd:'', yyyy:'' }).
 */
function distributeTaxYears(input) {
  const tokens = String(input || '').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const dates = [];
  for (const tok of tokens) {
    if (dates.length >= 4) break;
    const full = tok.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (full) {
      dates.push({
        mm: full[1].padStart(2, '0'),
        dd: full[2].padStart(2, '0'),
        yyyy: full[3]
      });
      continue;
    }
    const yr = tok.match(/^(\d{4})$/);
    if (yr) {
      dates.push({ mm: '12', dd: '31', yyyy: yr[1] });
    }
    // Silently skip tokens we don't recognize (e.g. "or", "period")
  }
  while (dates.length < 4) dates.push({ mm: '', dd: '', yyyy: '' });
  return dates.slice(0, 4);
}

function taxFormToPdfValues(taxForm) {
  const v = String(taxForm || '1040').toLowerCase();
  const map = {
    '1040': ['1040', '', ''],
    '1040-sr': ['1040-SR', '', ''],
    '1120': ['1120', '', ''],
    '1065': ['1065', '', ''],
    w2: ['W-2', '', ''],
    '1099': ['1099', '', ''],
    other: ['', '', '']
  };
  return map[v] || ['1040', '', ''];
}

/**
 * @param {object} body - same shape as worksheet (f4506* keys)
 * @returns {Promise<Uint8Array>}
 */
async function generateForm4506cPdfBuffer(body) {
  const b = body || {};
  const templatePath = process.env.FORM_4506C_PDF_PATH
    ? path.resolve(process.env.FORM_4506C_PDF_PATH)
    : DEFAULT_TEMPLATE;

  const bytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  const primary = splitPersonName(b.f4506TaxpayerName);
  safeSetText(form, F.primaryFirst, primary.first);
  safeSetText(form, F.primaryMi, primary.mi);
  safeSetText(form, F.primaryLast, primary.last);
  safeSetText(form, F.primarySsn, digitsOnly(b.f4506Ssn, 9));

  if (b.f4506SpouseName) {
    const sp = splitPersonName(b.f4506SpouseName);
    safeSetText(form, F.jointFirst, sp.first);
    safeSetText(form, F.jointMi, sp.mi);
    safeSetText(form, F.jointLast, sp.last);
    safeSetText(form, F.jointSsn, digitsOnly(b.f4506SpouseSsn, 9));
  }

  const apt = b.f4506Apt ? `, ${b.f4506Apt}` : '';
  safeSetText(form, F.curStreet, String(b.f4506AddressLine || '').trim() + apt);
  safeSetText(form, F.curCity, b.f4506City);
  safeSetText(form, F.curState, (b.f4506State || '').toString().toUpperCase().slice(0, 2));
  safeSetText(form, F.curZip, b.f4506Zip);

  if (b.f4506PrevAddress) {
    const p = parsePrevAddress(b.f4506PrevAddress);
    safeSetText(form, F.prevStreet, p.street);
    safeSetText(form, F.prevCity, p.city);
    safeSetText(form, F.prevState, p.state);
    safeSetText(form, F.prevZip, p.zip);
  }

  safeSetText(form, F.ivesName, b.f4506ThirdPartyName);
  const tp = parseThirdPartyAddress(b.f4506ThirdPartyAddress);
  safeSetText(form, F.ivesStreet, tp.street || b.f4506ThirdPartyAddress);
  safeSetText(form, F.ivesCity, tp.city);
  safeSetText(form, F.ivesState, tp.state);
  safeSetText(form, F.ivesZip, tp.zip);
  safeSetText(form, F.customerFile, b.f4506ThirdPartyCaf);
  safeSetText(form, F.uniqueId, b.f4506LoanNumber);

  applyTranscriptType(form, b.f4506TranscriptType);

  // Line 8: distribute tax years into MM/DD/YYYY slots
  const dateRows = distributeTaxYears(b.f4506TaxYears);
  for (let i = 0; i < F.q8Dates.length; i++) {
    const [mmPath, ddPath, yyyyPath] = F.q8Dates[i];
    const d = dateRows[i];
    safeSetText(form, mmPath, d.mm);
    safeSetText(form, ddPath, d.dd);
    safeSetText(form, yyyyPath, d.yyyy);
  }

  if (b.f4506Notes) safeSetText(form, F.transcriptRequest, b.f4506Notes);

  const [n1, n2, n3] = taxFormToPdfValues(b.f4506TaxForm);
  safeSetText(form, F.formNum1, n1);
  safeSetText(form, F.formNum2, n2);
  safeSetText(form, F.formNum3, n3);

  return pdfDoc.save();
}

module.exports = {
  generateForm4506cPdfBuffer,
  // Exported for tests:
  splitPersonName,
  parseThirdPartyAddress,
  parsePrevAddress,
  taxFormToPdfValues,
  distributeTaxYears,
  digitsOnly,
  FIELD_PATHS: F
};
