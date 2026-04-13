(function() {
  'use strict';

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const name = val('borrowerName');
    const loanNum = val('loanNumber');
    const current = val('currentAddress');
    const previous = val('previousAddress');
    const discrepancy = val('discrepancyType');
    const explanation = val('explanation');

    if (!name && !explanation) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your letter of explanation.</p>';
      return;
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let html = '<div class="letter-content">';
    html += '<p class="letter-date">' + today + '</p>';
    html += '<p>To Whom It May Concern,</p>';
    html += '<p>I, <strong>' + MSFG.escHtml(name || 'the borrower') + '</strong>';
    if (loanNum) html += ' (Loan #' + MSFG.escHtml(loanNum) + ')';
    html += ', am writing to provide an explanation regarding the address discrepancy on my records.</p>';

    if (current) html += '<p><strong>Current Address:</strong> ' + MSFG.escHtml(current) + '</p>';
    if (previous) html += '<p><strong>Previous Address:</strong> ' + MSFG.escHtml(previous) + '</p>';

    if (explanation) {
      html += '<p>' + MSFG.escHtml(explanation).replace(/\n/g, '<br>') + '</p>';
    }

    html += '<p>I certify that the above information is true and correct to the best of my knowledge.</p>';
    html += '<p>Sincerely,<br><strong>' + MSFG.escHtml(name) + '</strong></p>';
    html += '</div>';

    preview.innerHTML = html;
  }

  function getEmailData() {
    const rows = [];
    if (val('borrowerName')) rows.push({ label: 'Borrower', value: val('borrowerName') });
    if (val('loanNumber')) rows.push({ label: 'Loan Number', value: val('loanNumber') });
    if (val('currentAddress')) rows.push({ label: 'Current Address', value: val('currentAddress') });
    if (val('previousAddress')) rows.push({ label: 'Previous Address', value: val('previousAddress') });
    const discEl = document.getElementById('discrepancyType');
    if (discEl && discEl.selectedIndex > 0) rows.push({ label: 'Discrepancy Type', value: discEl.options[discEl.selectedIndex].text });
    if (val('explanation')) rows.push({ label: 'Explanation', value: val('explanation') });

    return {
      title: 'Address Letter of Explanation',
      sections: [{ heading: 'Address Details', rows: rows }]
    };
  }

  document.addEventListener('DOMContentLoaded', function() {
    const fields = ['borrowerName', 'loanNumber', 'currentAddress', 'previousAddress',
                    'discrepancyType', 'explanation'];

    fields.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', generateLetter);
      if (el) el.addEventListener('change', generateLetter);
    });

    generateLetter();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('address-lox', function() {
        return getEmailData();
      });
    }
  });
})();
