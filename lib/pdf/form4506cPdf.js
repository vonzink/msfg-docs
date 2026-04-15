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
  question7: 'form1[0].page_1[0].question_7[0]',
  formNum1: 'form1[0].page_1[0].#subform[9].form_number1[0]',
  formNum2: 'form1[0].page_1[0].#subform[9].form_number2[0]',
  formNum3: 'form1[0].page_1[0].#subform[9].form_number3[0]'
};

function splitPersonName(full) {
  const s = String(full || '').trim();
  if (!s) return { first: '', mi: '', last: '' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], mi: '', last: '' };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  let mi = '';
  let firstOut = first;
  const firstParts = first.split(/\s+/);
  if (firstParts.length > 1 && firstParts[firstParts.length - 1].length === 1) {
    mi = firstParts[firstParts.length - 1];
    firstOut = firstParts.slice(0, -1).join(' ');
  }
  return { first: firstOut.slice(0, 80), mi: mi.slice(0, 1), last: last.slice(0, 80) };
}

function digitsOnly(s, max) {
  const d = String(s || '').replace(/\D/g, '');
  const m = max || 9;
  return d.slice(0, m);
}

function safeSetText(form, fieldName, text) {
  if (text == null || text === '') return;
  try {
    const tf = form.getTextField(fieldName);
    tf.setText(String(text).slice(0, 2000));
  } catch (e) {
    /* missing or wrong type */
  }
}

function safeUncheck(form, fieldName) {
  try {
    form.getCheckBox(fieldName).uncheck();
  } catch (e) { /* */ }
}

function safeCheck(form, fieldName) {
  try {
    form.getCheckBox(fieldName).check();
  } catch (e) { /* */ }
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

function parseThirdPartyAddress(addr) {
  const s = String(addr || '').trim();
  if (!s) return { street: '', city: '', state: '', zip: '' };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const m = last.match(/^([A-Za-z]{2})\s+(\d{5}(-\d{4})?)$/);
    if (m) {
      return {
        street: parts[0],
        city: parts[1],
        state: m[1].toUpperCase(),
        zip: m[2]
      };
    }
  }
  return { street: s.slice(0, 500), city: '', state: '', zip: '' };
}

function parsePrevAddress(oneLine) {
  const s = String(oneLine || '').trim();
  if (!s) return { street: '', city: '', state: '', zip: '' };
  return parseThirdPartyAddress(s);
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
  safeSetText(form, F.question7, b.f4506TaxYears);
  if (b.f4506Notes) safeSetText(form, F.transcriptRequest, b.f4506Notes);

  const [n1, n2, n3] = taxFormToPdfValues(b.f4506TaxForm);
  safeSetText(form, F.formNum1, n1);
  safeSetText(form, F.formNum2, n2);
  safeSetText(form, F.formNum3, n3);

  return pdfDoc.save();
}

module.exports = { generateForm4506cPdfBuffer };
