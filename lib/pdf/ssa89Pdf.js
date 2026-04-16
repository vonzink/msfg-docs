'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const DEFAULT_TEMPLATE = path.join(__dirname, '../../public/documents/ssa-89.pdf');

/** SSA-89 AcroForm field paths (from pdf-lib field dump). */
const F = {
  printedName: 'form1[0].#subform[0].p1_PrintedName_FLD[0]',
  dob: 'form1[0].#subform[0].p1_DOB_FLD[0]',
  ssn: 'form1[0].#subform[0].P1_SSN_FLD[0]',

  // Reason-for-verification checkboxes
  cbMortgage: 'form1[0].#subform[0].P1_Mortgage_CB[0]',
  cbBankAccount: 'form1[0].#subform[0].P1_Bankacct_CB[0]',
  cbCreditCard: 'form1[0].#subform[0].P1_CreditCard_CB[0]',
  cbLoan: 'form1[0].#subform[0].p1_Loan_CB[0]',
  cbRetirement: 'form1[0].#subform[0].p1_Retirement_CB[0]',
  cbJob: 'form1[0].#subform[0].P1_applyforajob_CB[0]',
  cbLicense: 'form1[0].#subform[0].P1_licensingrequriement_CB[0]',
  cbOther: 'form1[0].#subform[0].P1_Other_CB[0]',
  otherText: 'form1[0].#subform[0].P1_OtherText_FLD[0]',

  // Requesting company (typically the lender)
  companyName: 'form1[0].#subform[0].P1_CompanyName_FLD[0]',
  companyAddress: 'form1[0].#subform[0].p1_CompanyAddress_FLD[0]',

  // Agent / verification vendor
  agentName: 'form1[0].#subform[0].P1_AgentsName_FLD[0]',
  agentAddress: 'form1[0].#subform[0].P1_AgentAddress_FLD[0]',

  // Validity + signature
  validFor: 'form1[0].#subform[0].p1_ValidFor_FLD[0]',         // max 4
  initial: 'form1[0].#subform[0].p1_Initial_FLD[0]',           // max 5
  signature: 'form1[0].#subform[0].p1_Signature_FLD[0]',
  dateSigned: 'form1[0].#subform[0].p1_DateSigned_FLD[0]',
  relationship: 'form1[0].#subform[0].p1_Relationship_FLD[0]'
};

/** Map of worksheet reason ids → PDF checkbox field paths. */
const REASON_CHECKBOXES = {
  mortgage: F.cbMortgage,
  bankAccount: F.cbBankAccount,
  creditCard: F.cbCreditCard,
  loan: F.cbLoan,
  retirement: F.cbRetirement,
  job: F.cbJob,
  license: F.cbLicense,
  other: F.cbOther
};

function digitsOnly(s, max) {
  const d = String(s || '').replace(/\D/g, '');
  return max ? d.slice(0, max) : d;
}

/** Format a freeform date string into MM/DD/YYYY when we can; otherwise pass through. */
function formatDate(s) {
  const v = String(s || '').trim();
  if (!v) return '';
  // ISO date YYYY-MM-DD → MM/DD/YYYY
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  // Already MM/DD/YYYY or M/D/YYYY → normalize zero-padding
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const yyyy = us[3].length === 2 ? (Number(us[3]) > 30 ? '19' + us[3] : '20' + us[3]) : us[3];
    return `${us[1].padStart(2, '0')}/${us[2].padStart(2, '0')}/${yyyy}`;
  }
  return v;
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

function safeCheck(form, fieldName) {
  try { form.getCheckBox(fieldName).check(); } catch (_e) { /* */ }
}
function safeUncheck(form, fieldName) {
  try { form.getCheckBox(fieldName).uncheck(); } catch (_e) { /* */ }
}

function applyReasons(form, reasons) {
  // Always start clean so callers can fully control state.
  Object.values(REASON_CHECKBOXES).forEach((fp) => safeUncheck(form, fp));
  if (!reasons || typeof reasons !== 'object') return;
  Object.keys(REASON_CHECKBOXES).forEach((key) => {
    if (reasons[key]) safeCheck(form, REASON_CHECKBOXES[key]);
  });
}

/**
 * @param {object} body  worksheet payload (sSsa* keys; see views/documents/ssa-89.ejs)
 * @param {object} [options]
 * @param {Buffer|Uint8Array} [options.baseTemplateBytes]
 *        Override the SSA blank with an already-loaded PDF (e.g. an
 *        investor's pre-filled copy from dashboardSync.ensurePdfBytes).
 *        When provided, company/agent worksheet inputs are NOT stamped —
 *        the investor's pre-filled company + agent block in the PDF is
 *        the source of truth.
 * @returns {Promise<Uint8Array>}
 */
async function generateSsa89PdfBuffer(body, options) {
  const b = body || {};
  const opts = options || {};
  const usingInvestorBase = !!opts.baseTemplateBytes;

  let bytes = opts.baseTemplateBytes;
  if (!bytes) {
    const templatePath = process.env.SSA_89_PDF_PATH
      ? path.resolve(process.env.SSA_89_PDF_PATH)
      : DEFAULT_TEMPLATE;
    bytes = fs.readFileSync(templatePath);
  }
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  safeSetText(form, F.printedName, b.sSsaPrintedName);
  safeSetText(form, F.dob, formatDate(b.sSsaDob));
  safeSetText(form, F.ssn, digitsOnly(b.sSsaSsn, 9));

  applyReasons(form, b.sSsaReasons);
  if (b.sSsaReasons && b.sSsaReasons.other) safeSetText(form, F.otherText, b.sSsaOtherText);

  // Company / agent block — investor's pre-filled PDF (when picked) is the
  // source of truth, so worksheet inputs don't overwrite. Only stamp these
  // when generating from the blank SSA template.
  if (!usingInvestorBase) {
    safeSetText(form, F.companyName, b.sSsaCompanyName);
    safeSetText(form, F.companyAddress, b.sSsaCompanyAddress);
    safeSetText(form, F.agentName, b.sSsaAgentName);
    safeSetText(form, F.agentAddress, b.sSsaAgentAddress);
  }

  safeSetText(form, F.validFor, String(b.sSsaValidFor || '').slice(0, 4));
  safeSetText(form, F.initial, String(b.sSsaInitial || '').slice(0, 5));
  safeSetText(form, F.signature, b.sSsaSignature);
  safeSetText(form, F.dateSigned, formatDate(b.sSsaDateSigned));
  safeSetText(form, F.relationship, b.sSsaRelationship);

  return pdfDoc.save();
}

module.exports = {
  generateSsa89PdfBuffer,
  // Exported for tests / introspection
  formatDate,
  digitsOnly,
  REASON_CHECKBOXES,
  FIELD_PATHS: F
};
