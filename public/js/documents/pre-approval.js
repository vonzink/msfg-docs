(function() {
  'use strict';

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (!el || v == null || v === '') return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isChecked(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

  // Track manual edits to the preview so we don't overwrite them on
  // every form input. Cleared when the user clicks "Reset preview".
  let previewDirty = false;

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;
    if (previewDirty) return;

    const borrowerName = val('borrowerName');
    const borrowerAddress = val('borrowerAddress');
    const loanType = val('loanType');
    const loanPurpose = val('loanPurpose');
    const amount = val('approvalAmount');
    const rate = val('interestRate');
    const showRate = isChecked('includeInterestRate');
    const term = val('loanTerm');
    const downPayment = val('downPayment');
    const expiration = val('expirationDate');
    const loName = val('loName');
    const loNMLS = val('loNMLS');
    const loPhone = val('loPhone');
    const loEmail = val('loEmail');
    const conditions = val('conditions');

    if (!borrowerName && !amount) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your pre-approval letter.</p>';
      return;
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let html = '<div class="letter-content">';
    html += '<p class="letter-date">' + today + '</p>';
    html += '<p>To Whom It May Concern,</p>';
    html += '<p>This letter confirms that <strong>' + MSFG.escHtml(borrowerName || 'the borrower') + '</strong>';
    if (borrowerAddress) html += ', residing at ' + MSFG.escHtml(borrowerAddress) + ',';
    html += ' has been pre-approved for a mortgage loan with the following terms:</p>';

    html += '<table class="data-table" style="margin:1rem 0;">';
    if (loanType) html += '<tr><td><strong>Loan Type</strong></td><td>' + MSFG.escHtml(loanType) + '</td></tr>';
    if (loanPurpose) html += '<tr><td><strong>Purpose</strong></td><td>' + MSFG.escHtml(loanPurpose) + '</td></tr>';
    if (amount) html += '<tr><td><strong>Approved Amount</strong></td><td>' + MSFG.escHtml(amount) + '</td></tr>';
    if (rate && showRate) html += '<tr><td><strong>Interest Rate</strong></td><td>' + MSFG.escHtml(rate) + '</td></tr>';
    if (term) html += '<tr><td><strong>Loan Term</strong></td><td>' + MSFG.escHtml(term) + '</td></tr>';
    if (downPayment) html += '<tr><td><strong>Down Payment</strong></td><td>' + MSFG.escHtml(downPayment) + '</td></tr>';
    if (expiration) {
      const fmtExp = new Date(expiration + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      html += '<tr><td><strong>Valid Until</strong></td><td>' + fmtExp + '</td></tr>';
    }
    html += '</table>';

    if (conditions) {
      html += '<p><strong>Conditions:</strong> ' + MSFG.escHtml(conditions).replace(/\n/g, '<br>') + '</p>';
    } else {
      html += '<p><strong>Conditions:</strong> Subject to verification of income, assets, employment, credit, and satisfactory property appraisal.</p>';
    }

    html += '<p>This pre-approval is not a commitment to lend. Final approval is subject to underwriting review.</p>';

    if (loName) {
      html += '<p>Sincerely,<br><strong>' + MSFG.escHtml(loName) + '</strong>';
      if (loNMLS) html += '<br>NMLS# ' + MSFG.escHtml(loNMLS);
      if (loPhone) html += '<br>' + MSFG.escHtml(loPhone);
      if (loEmail) html += '<br>' + MSFG.escHtml(loEmail);
      html += '</p>';
    }

    html += '</div>';
    preview.innerHTML = html;
  }

  function getEmailData() {
    const rows = [];
    if (val('borrowerName')) rows.push({ label: 'Borrower', value: val('borrowerName') });
    if (val('loanType')) rows.push({ label: 'Loan Type', value: val('loanType') });
    if (val('loanPurpose')) rows.push({ label: 'Purpose', value: val('loanPurpose') });
    if (val('approvalAmount')) rows.push({ label: 'Approved Amount', value: val('approvalAmount'), bold: true });
    if (val('interestRate')) rows.push({ label: 'Interest Rate', value: val('interestRate') });
    if (val('loanTerm')) rows.push({ label: 'Loan Term', value: val('loanTerm') });
    if (val('downPayment')) rows.push({ label: 'Down Payment', value: val('downPayment') });
    if (val('expirationDate')) {
      const fmtExp = new Date(val('expirationDate') + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      rows.push({ label: 'Valid Until', value: fmtExp });
    }

    const loRows = [];
    if (val('loName')) loRows.push({ label: 'Loan Officer', value: val('loName') });
    if (val('loNMLS')) loRows.push({ label: 'NMLS#', value: val('loNMLS') });
    if (val('loPhone')) loRows.push({ label: 'Phone', value: val('loPhone') });
    if (val('loEmail')) loRows.push({ label: 'Email', value: val('loEmail') });

    const sections = [{ heading: 'Loan Details', rows: rows }];
    if (loRows.length) sections.push({ heading: 'Loan Officer', rows: loRows });

    return { title: 'Pre-Approval Letter', sections: sections };
  }

  /* MISMO prepop — fills LO info from the originator PARTY in the
   *  closing XML (mismo-parser surfaces these as loanOriginator*).
   *  Borrower name + address are also wired via mismo-embed.js's
   *  applyToPreApproval; here we only handle the new LO fields. */
  function applyMismo(parsed) {
    if (!parsed) return;
    if (parsed.loanOriginatorName) setVal('loName', parsed.loanOriginatorName);
    if (parsed.loanOriginatorNmls) setVal('loNMLS', parsed.loanOriginatorNmls);
    if (parsed.loanOriginatorPhone) setVal('loPhone', parsed.loanOriginatorPhone);
    if (parsed.loanOriginatorEmail) setVal('loEmail', parsed.loanOriginatorEmail);
    // Loan terms also come through MISMO directly (rate / term / amount /
    // type / purpose) — only fill empty fields so we don't trample
    // anything the LO has already typed.
    if (parsed.baseLoanAmount && !val('approvalAmount')) {
      setVal('approvalAmount', formatCurrency(parsed.baseLoanAmount));
    }
    if (parsed.noteRate && !val('interestRate')) {
      setVal('interestRate', formatPercent(parsed.noteRate));
    }
  }

  function formatCurrency(n) {
    const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[,$]/g, ''));
    if (!isFinite(num) || num <= 0) return '';
    return '$' + Math.round(num).toLocaleString('en-US');
  }
  function formatPercent(p) {
    const num = typeof p === 'number' ? p : parseFloat(String(p).replace(/[%\s]/g, ''));
    if (!isFinite(num) || num <= 0) return '';
    return num.toFixed(3) + '%';
  }

  document.addEventListener('DOMContentLoaded', function() {
    const fields = ['borrowerName', 'borrowerAddress', 'loanType', 'loanPurpose',
                    'approvalAmount', 'interestRate', 'includeInterestRate',
                    'loanTerm', 'downPayment',
                    'expirationDate', 'loName', 'loNMLS', 'loPhone', 'loEmail', 'conditions'];

    fields.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', generateLetter);
      if (el) el.addEventListener('change', generateLetter);
    });

    // Editable preview wiring
    const preview = document.getElementById('letterPreview');
    if (preview) preview.addEventListener('input', function () { previewDirty = true; });
    const reset = document.getElementById('paResetPreview');
    if (reset) reset.addEventListener('click', function (e) {
      e.preventDefault(); previewDirty = false; generateLetter();
    });

    generateLetter();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('pre-approval', function() {
        return getEmailData();
      });
    }

    // MISMO prepop — listen for workspace broadcasts AND ask the
    // parent to re-broadcast in case MISMO was imported before this
    // iframe loaded.
    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_MISMO') return;
      applyMismo(e.data.payload && e.data.payload.parsed);
    });
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
      }
    } catch (_e) { /* ignore */ }
  });
})();
