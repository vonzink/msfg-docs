(function() {
  'use strict';

  const REASONS = {
    'unauthorized': 'I did not authorize this inquiry and request that it be removed from my credit report immediately.',
    'fraud': 'This inquiry is the result of identity theft or fraud. I did not authorize any entity to pull my credit report on this date.',
    'duplicate': 'This appears to be a duplicate inquiry. I request that the duplicate entry be removed.',
    'explanation': ''
  };

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const senderName = val('senderName');
    const senderAddress = val('senderAddress');
    const recipientName = val('recipientName');
    const recipientAddress = val('recipientAddress');
    const inquiryDate = val('inquiryDate');
    const inquiryCompany = val('inquiryCompany');
    const reasonKey = val('inquiryReason');
    const notes = val('additionalNotes');

    if (!senderName && !recipientName) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your letter.</p>';
      return;
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reasonText = REASONS[reasonKey] || '';

    let html = '<div class="letter-content">';
    html += '<p class="letter-date">' + today + '</p>';
    if (senderName) html += '<p><strong>' + MSFG.escHtml(senderName) + '</strong><br>' + MSFG.escHtml(senderAddress) + '</p>';
    if (recipientName) html += '<p>' + MSFG.escHtml(recipientName) + '<br>' + MSFG.escHtml(recipientAddress) + '</p>';

    html += '<p>To Whom It May Concern,</p>';
    html += '<p>I am writing to dispute a credit inquiry that appears on my credit report. ';
    if (inquiryCompany) html += 'The inquiry was made by <strong>' + MSFG.escHtml(inquiryCompany) + '</strong>';
    if (inquiryDate) {
      const fmtDate = new Date(inquiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      html += ' on <strong>' + fmtDate + '</strong>';
    }
    html += '.</p>';

    if (reasonText) html += '<p>' + MSFG.escHtml(reasonText) + '</p>';
    if (notes) html += '<p>' + MSFG.escHtml(notes).replace(/\n/g, '<br>') + '</p>';

    html += '<p>Please investigate this matter and remove the unauthorized inquiry from my credit report. ';
    html += 'I request that you send me written confirmation of the results of your investigation.</p>';
    html += '<p>Thank you for your prompt attention to this matter.</p>';
    html += '<p>Sincerely,<br><strong>' + MSFG.escHtml(senderName) + '</strong></p>';
    html += '</div>';

    preview.innerHTML = html;
  }

  function getEmailData() {
    const rows = [];
    rows.push({ label: 'Sender', value: val('senderName') });
    rows.push({ label: 'Recipient', value: val('recipientName') });
    if (val('inquiryDate')) {
      const fmtDate = new Date(val('inquiryDate') + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      rows.push({ label: 'Inquiry Date', value: fmtDate });
    }
    if (val('inquiryCompany')) rows.push({ label: 'Company', value: val('inquiryCompany') });
    const reasonEl = document.getElementById('inquiryReason');
    if (reasonEl && reasonEl.selectedIndex > 0) rows.push({ label: 'Reason', value: reasonEl.options[reasonEl.selectedIndex].text });
    if (val('additionalNotes')) rows.push({ label: 'Notes', value: val('additionalNotes') });

    return {
      title: 'Credit Inquiry Letter',
      sections: [{ heading: 'Letter Details', rows: rows }]
    };
  }

  document.addEventListener('DOMContentLoaded', function() {
    const fields = ['senderName', 'senderAddress', 'senderSSN', 'senderDOB',
                    'recipientName', 'recipientAddress', 'inquiryDate',
                    'inquiryCompany', 'inquiryReason', 'additionalNotes'];

    fields.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', generateLetter);
      if (el) el.addEventListener('change', generateLetter);
    });

    generateLetter();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    // Report template extractor
    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('credit-inquiry', function() {
        return getEmailData();
      });
    }
  });
})();
