(function() {
  'use strict';

  const REASON_PRESETS = {
    mortgage_shopping: 'Shopping for mortgage — no new debt.',
    car_shopping: 'Shopping for car — no new debt.',
    unknown: 'I don’t know.',
    notes: ''
  };

  function normalize(s) {
    return String(s || '').trim().replace(/\r\n/g, '\n');
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function todayLong() {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function parseDateLong(yyyyMmDd) {
    if (!yyyyMmDd) return '';
    try {
      return new Date(yyyyMmDd + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return yyyyMmDd;
    }
  }

  function getRows() {
    const tbody = document.getElementById('inquiryTbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).map((tr, idx) => {
      const date = tr.querySelector('[data-field="date"]')?.value?.trim() || '';
      const creditor = tr.querySelector('[data-field="creditor"]')?.value?.trim() || '';
      const reason = tr.querySelector('[data-field="reason"]')?.value || '';
      const explanation = tr.querySelector('[data-field="explanation"]')?.value?.trim() || '';
      return { no: idx + 1, date, creditor, reason, explanation };
    }).filter(r => r.date || r.creditor || r.explanation);
  }

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const senderName = val('senderName');
    const coBorrowerName = val('coBorrowerName');
    const subjectPropertyAddress = val('subjectPropertyAddress');
    const loanNumber = val('loanNumber');
    const letterDate = val('letterDate') || todayLong();
    const rows = getRows();

    if (!senderName && !rows.length) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your letter.</p>';
      return;
    }

    let html = '<div class="letter-content">';
    html += '<p class="letter-date">' + MSFG.escHtml(letterDate) + '</p>';

    if (senderName) {
      html += '<p><strong>' + MSFG.escHtml(senderName) + '</strong>';
      if (coBorrowerName) html += '<br><strong>' + MSFG.escHtml(coBorrowerName) + '</strong>';
      if (subjectPropertyAddress) html += '<br>' + MSFG.escHtml(subjectPropertyAddress);
      if (loanNumber) html += '<br>Loan #: ' + MSFG.escHtml(loanNumber);
      html += '</p>';
    }

    html += '<p>To Whom It May Concern,</p>';
    html += '<p>Please see the explanations for the following credit inquiries.</p>';

    if (rows.length) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
      html += '<thead><tr>' +
        '<th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 8px;width:50px;">No.</th>' +
        '<th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 8px;width:160px;">Inquiry Date</th>' +
        '<th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 8px;width:220px;">Creditor</th>' +
        '<th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 8px;">Explanation</th>' +
      '</tr></thead><tbody>';
      rows.forEach(r => {
        html += '<tr>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">' + r.no + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">' + MSFG.escHtml(parseDateLong(r.date)) + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">' + MSFG.escHtml(r.creditor) + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">' + MSFG.escHtml(r.explanation).replace(/\\n/g, '<br>') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<p class="text-muted">No inquiries entered yet.</p>';
    }

    html += '<p>Thank you,</p>';
    html += '<p><strong>' + MSFG.escHtml(senderName) + '</strong></p>';
    html += '</div>';

    preview.innerHTML = html;
  }

  function getEmailData() {
    const rows = [];
    rows.push({ label: 'Borrower', value: val('senderName') });
    if (val('coBorrowerName')) rows.push({ label: 'Co-Borrower', value: val('coBorrowerName') });
    if (val('subjectPropertyAddress')) rows.push({ label: 'Subject Property', value: val('subjectPropertyAddress') });
    if (val('loanNumber')) rows.push({ label: 'Loan Number', value: val('loanNumber') });

    const inquiryRows = getRows();
    if (inquiryRows.length) {
      inquiryRows.forEach(r => {
        rows.push({
          stacked: true,
          label: `#${r.no} • ${parseDateLong(r.date)} • ${r.creditor || '—'}`,
          value: r.explanation || ''
        });
      });
    }

    return {
      title: 'Credit Inquiry Letter',
      sections: [{ heading: 'Letter Details', rows: rows }]
    };
  }

  function renderInquiryRow(no, data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${no}</strong></td>
      <td><input class="credit-inquiry__cell-input" type="date" data-field="date" value="${data?.date ? String(data.date) : ''}"></td>
      <td><input class="credit-inquiry__cell-input" type="text" data-field="creditor" placeholder="Creditor" value="${data?.creditor ? MSFG.escHtml(String(data.creditor)) : ''}"></td>
      <td>
        <div style="display:grid;gap:8px;">
          <select class="credit-inquiry__cell-select" data-field="reason">
            <option value="">Reason for inquiry…</option>
            <option value="mortgage_shopping">Shopping for mortgage - no new debt</option>
            <option value="car_shopping">Shopping for Car - no new debt</option>
            <option value="unknown">I don't know</option>
            <option value="notes">Additional notes</option>
          </select>
          <textarea class="credit-inquiry__cell-textarea" data-field="explanation" placeholder="Explanation">${data?.explanation ? MSFG.escHtml(String(data.explanation)) : ''}</textarea>
        </div>
      </td>
      <td><button type="button" class="credit-inquiry__row-remove" title="Remove">×</button></td>
    `;

    const reasonSel = tr.querySelector('[data-field="reason"]');
    const explanation = tr.querySelector('[data-field="explanation"]');
    if (reasonSel && data?.reason) reasonSel.value = data.reason;
    if (reasonSel && explanation) {
      let lastAuto = '';
      reasonSel.addEventListener('change', () => {
        const preset = REASON_PRESETS[reasonSel.value];
        if (typeof preset !== 'string') return;

        const cur = normalize(explanation.value);
        const last = normalize(lastAuto);

        // Overwrite if:
        // - user hasn't typed anything (empty), OR
        // - current value still matches the last auto-filled preset
        if (!cur || (last && cur === last)) {
          explanation.value = preset;
          lastAuto = preset;
          explanation.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // user customized explanation; don't stomp it
          lastAuto = '';
        }
      });
    }

    tr.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', generateLetter);
      el.addEventListener('change', generateLetter);
    });

    const removeBtn = tr.querySelector('.credit-inquiry__row-remove');
    removeBtn?.addEventListener('click', () => {
      tr.remove();
      renumberRows();
      generateLetter();
    });

    return tr;
  }

  function renumberRows() {
    const tbody = document.getElementById('inquiryTbody');
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, idx) => {
      const td0 = tr.querySelector('td');
      if (td0) td0.innerHTML = `<strong>${idx + 1}</strong>`;
    });
  }

  function buildPdfPayload() {
    return {
      senderName: val('senderName'),
      coBorrowerName: val('coBorrowerName'),
      subjectPropertyAddress: val('subjectPropertyAddress'),
      loanNumber: val('loanNumber'),
      letterDate: val('letterDate') || todayLong(),
      inquiries: getRows().map(r => ({
        no: r.no,
        inquiryDate: r.date,
        creditor: r.creditor,
        explanation: r.explanation
      }))
    };
  }

  async function exportPdf() {
    const payload = buildPdfPayload();

    const resp = await fetch(MSFG.apiUrl('/api/pdf/credit-inquiry'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('PDF export failed');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Credit-Inquiry-Letter-${(payload.loanNumber || 'draft').replace(/[^a-z0-9_-]+/gi, '-')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener('DOMContentLoaded', function() {
    const letterDate = document.getElementById('letterDate');
    if (letterDate && !letterDate.value) letterDate.value = todayLong();

    const fields = ['senderName', 'coBorrowerName', 'subjectPropertyAddress', 'loanNumber'];

    fields.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', generateLetter);
      if (el) el.addEventListener('change', generateLetter);
    });

    const tbody = document.getElementById('inquiryTbody');
    const addBtn = document.getElementById('addInquiryRow');
    if (tbody && addBtn) {
      // start with one row
      tbody.appendChild(renderInquiryRow(1));
      addBtn.addEventListener('click', () => {
        tbody.appendChild(renderInquiryRow(tbody.querySelectorAll('tr').length + 1));
        generateLetter();
      });
    }

    generateLetter();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    // Report template extractor
    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('credit-inquiry', function() {
        return getEmailData();
      });
    }

    document.querySelectorAll('[data-action="doc-export-pdf"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          await exportPdf();
        } catch (e) {
          console.error(e);
          alert('Could not export PDF. Please try again.');
        } finally {
          btn.disabled = false;
        }
      });
    });
  });
})();
