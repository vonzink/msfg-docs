'use strict';

const { generateLetterPdfBuffer } = require('./letterPdf');
const { loadSignatureImage } = require('./signatureAsset');
const { loadLogoImage, loadEhlImage } = require('./logoAsset');

/**
 * Pre-Approval Letter PDF.
 * Delegates to the shared letter renderer for the 4 visual styles.
 *
 * Body shape (matches the worksheet ids in views/documents/pre-approval.ejs):
 *   { borrowerNames, borrowerAddress, loanType, loanPurpose,
 *     approvalAmount, interestRate, includeInterestRate,
 *     loanTerm, downPayment, expirationDate,
 *     loName, loNMLS, loPhone, loEmail, conditions,
 *     letterStyle }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generatePreApprovalPdfBuffer(body) {
  const b = body || {};
  const style = String(b.letterStyle || 'classic').toLowerCase();

  // Header — borrower + property
  const headerRows = [];
  if (b.borrowerNames) headerRows.push({ label: 'Borrower', value: b.borrowerNames });
  if (b.borrowerAddress) headerRows.push({ label: 'Address', value: b.borrowerAddress });

  // Loan-terms table
  const termRows = [];
  if (b.loanType) termRows.push({ label: 'Loan Type', value: b.loanType });
  if (b.loanPurpose) termRows.push({ label: 'Purpose', value: b.loanPurpose });
  if (b.includePropertyType && b.propertyType) termRows.push({ label: 'Property Type', value: b.propertyType });
  if (b.occupancy) termRows.push({ label: 'Occupancy', value: b.occupancy });
  if (b.approvalAmount) termRows.push({ label: 'Approved Amount', value: b.approvalAmount });
  // Respect the "Include in letter" toggle (default: include when rate is set).
  if (b.interestRate && b.includeInterestRate !== false) {
    termRows.push({ label: 'Interest Rate', value: b.interestRate });
  }
  if (b.loanTerm) termRows.push({ label: 'Loan Term', value: b.loanTerm });
  if (b.downPayment) termRows.push({ label: 'Down Payment', value: b.downPayment });
  if (b.expirationDate) {
    const exp = /^\d{4}-\d{2}-\d{2}$/.test(b.expirationDate)
      ? new Date(b.expirationDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : b.expirationDate;
    termRows.push({ label: 'Valid Until', value: exp });
  }

  const bodyContent = [];
  bodyContent.push({ type: 'paragraph', text: 'To Whom It May Concern,' });
  // Pluralize the verb when more than one borrower is named.
  const approvedVerb = / and |, /.test(b.borrowerNames || '') ? 'have' : 'has';
  bodyContent.push({
    type: 'paragraph',
    text: 'This letter confirms that ' + (b.borrowerNames || 'the borrower') +
      (b.borrowerAddress ? ', residing at ' + b.borrowerAddress + ',' : '') +
      ' ' + approvedVerb + ' been pre-approved for a mortgage loan with the following terms:',
  });

  if (termRows.length) {
    bodyContent.push({ type: 'table', rows: termRows });
  }

  bodyContent.push({
    type: 'paragraph',
    text: 'Conditions: ' + (b.conditions ||
      'Subject to verification of income, assets, employment, credit, and satisfactory property appraisal.'),
  });
  bodyContent.push({
    type: 'paragraph',
    text: 'This pre-approval is not a commitment to lend. Final approval is subject to underwriting review.',
  });

  // Loan Officer block — small sign-off table at the bottom of the body
  const loRows = [];
  if (b.loName) loRows.push({ label: 'Loan Officer', value: b.loName });
  if (b.loNMLS) loRows.push({ label: 'NMLS #', value: b.loNMLS });
  if (b.loPhone) loRows.push({ label: 'Phone', value: b.loPhone });
  if (b.loEmail) loRows.push({ label: 'Email', value: b.loEmail });
  if (loRows.length) {
    bodyContent.push({ type: 'heading', text: 'Loan Officer' });
    bodyContent.push({ type: 'table', rows: loRows });
  }

  return generateLetterPdfBuffer({
    style,
    settings: b.letterSettings || null,
    title: 'Pre-Approval Letter',
    dateLine: b.letterDate
      || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    headerRows,
    body: bodyContent,
    signatures: b.loName
      ? [{ caption: b.loName + (b.loNMLS ? ' (NMLS# ' + b.loNMLS + ')' : ''), stampImage: true }]
      : [{ caption: 'Loan Officer signature', stampImage: true }],
    signatureImage: loadSignatureImage(),
    // Branded letterhead: company logo (text wordmark fallback) + footer, plus
    // the Equal Housing Lender mark in the footer.
    brand: { logo: await loadLogoImage(), ehlLogo: await loadEhlImage(), company: 'Mountain State Financial Group' },
  });
}

module.exports = { generatePreApprovalPdfBuffer };
