(function () {
  'use strict';

  const rowsEl = document.getElementById('addressRows');
  const addBtn = document.getElementById('addAddressRow');

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (!el || v == null || v === '') return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function todayLong() {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* ---- Repeating address rows ---- */

  function buildRow(values) {
    values = values || {};
    const div = document.createElement('div');
    div.className = 'lox-row';
    div.innerHTML =
      '<div class="form-grid u-grid-2col">'
        + '<div class="form-group form-group--full">'
          + '<label>Address</label>'
          + '<input type="text" data-field="address" placeholder="123 Main St, City, ST 12345" value="' + MSFG.escHtml(values.address || '') + '">'
        + '</div>'
        + '<div class="form-group">'
          + '<label>Date range</label>'
          + '<input type="text" data-field="dates" placeholder="e.g. 06/2022 \u2013 03/2026" value="' + MSFG.escHtml(values.dates || '') + '">'
        + '</div>'
        + '<div class="form-group">'
          + '<label>Reason / discrepancy type</label>'
          + '<input type="text" data-field="reason" placeholder="Recent move / mailing vs physical / typo \u2026" value="' + MSFG.escHtml(values.reason || '') + '">'
        + '</div>'
        + '<div class="form-group form-group--full">'
          + '<label>Explanation</label>'
          + '<textarea data-field="explanation" rows="3" placeholder="Explain this address \u2014 the move, the discrepancy, supporting docs, etc.">' + MSFG.escHtml(values.explanation || '') + '</textarea>'
        + '</div>'
      + '</div>'
      + '<div class="lox-row-actions">'
        + '<button type="button" class="btn btn-link lox-row-remove">Remove this address</button>'
      + '</div>';

    div.querySelector('.lox-row-remove').addEventListener('click', function () {
      div.remove();
      generateLetter();
    });
    div.addEventListener('input', generateLetter);
    div.addEventListener('change', generateLetter);
    return div;
  }

  function addRow(values) {
    if (!rowsEl) return;
    rowsEl.appendChild(buildRow(values));
    generateLetter();
  }

  function collectRows() {
    if (!rowsEl) return [];
    const out = [];
    rowsEl.querySelectorAll('.lox-row').forEach(function (row) {
      out.push({
        address: (row.querySelector('[data-field="address"]') || {}).value || '',
        dates: (row.querySelector('[data-field="dates"]') || {}).value || '',
        reason: (row.querySelector('[data-field="reason"]') || {}).value || '',
        explanation: (row.querySelector('[data-field="explanation"]') || {}).value || ''
      });
    });
    return out;
  }

  /* ---- Letter preview ----
     The preview is contenteditable so the LO can hand-edit the
     final letter. We treat the preview as user-owned once they
     interact with it — subsequent field edits stop overwriting
     until they click "Reset preview" (which clears the dirty flag
     and re-renders from the fields). */

  let previewDirty = false;

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;
    if (previewDirty) return; // user is editing; leave them alone

    const name = val('borrowerName');
    const loanNum = val('loanNumber');
    const currentAddr = val('currentAddress');
    const letterDate = val('letterDate') || todayLong();
    const rows = collectRows().filter(function (r) {
      return r.address || r.dates || r.reason || r.explanation;
    });

    if (!name && !rows.length) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your letter of explanation.</p>';
      return;
    }

    let html = '<div class="letter-content">';
    html += '<p class="letter-date">' + MSFG.escHtml(letterDate) + '</p>';
    html += '<p>To Whom It May Concern,</p>';
    html += '<p>I, <strong>' + MSFG.escHtml(name || 'the borrower') + '</strong>';
    if (loanNum) html += ' (Loan #' + MSFG.escHtml(loanNum) + ')';
    html += ', am writing to provide an explanation regarding the address(es) shown on my records.</p>';
    if (currentAddr) html += '<p><strong>Current Address:</strong> ' + MSFG.escHtml(currentAddr) + '</p>';

    if (rows.length) {
      html += '<ol class="lox-row-list">';
      rows.forEach(function (r) {
        html += '<li>';
        if (r.address) html += '<div><strong>' + MSFG.escHtml(r.address) + '</strong>';
        if (r.dates) html += ' <span class="text-muted">(' + MSFG.escHtml(r.dates) + ')</span>';
        if (r.address || r.dates) html += '</div>';
        if (r.reason) html += '<div class="text-muted"><em>' + MSFG.escHtml(r.reason) + '</em></div>';
        if (r.explanation) html += '<p>' + MSFG.escHtml(r.explanation).replace(/\n/g, '<br>') + '</p>';
        html += '</li>';
      });
      html += '</ol>';
    }

    html += '<p>I certify that the above information is true and correct to the best of my knowledge.</p>';
    html += '<p>Sincerely,<br><strong>' + MSFG.escHtml(name) + '</strong></p>';
    html += '</div>';

    preview.innerHTML = html;
  }

  /* ---- Download PDF ---- */
  function collectPdfPayload() {
    const style = document.getElementById('letterStyleSelect');
    return {
      borrowerName: val('borrowerName'),
      loanNumber: val('loanNumber'),
      currentAddress: val('currentAddress'),
      letterDate: val('letterDate') || todayLong(),
      addresses: collectRows(),
      letterStyle: style ? style.value : 'classic'
    };
  }

  async function downloadPdf(btn) {
    if (btn) { btn.disabled = true; btn.dataset._lbl = btn.dataset._lbl || btn.textContent; btn.textContent = 'Building PDF…'; }
    try {
      const resp = await MSFG.fetch(MSFG.apiUrl('/api/pdf/address-lox'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectPdfPayload())
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Address-LOX.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Could not generate PDF.');
    } finally {
      if (btn) { btn.disabled = false; if (btn.dataset._lbl) btn.textContent = btn.dataset._lbl; }
    }
  }

  /* ---- Email / report extractor ---- */

  function getEmailData() {
    const headerRows = [];
    if (val('borrowerName')) headerRows.push({ label: 'Borrower', value: val('borrowerName') });
    if (val('loanNumber')) headerRows.push({ label: 'Loan Number', value: val('loanNumber') });
    if (val('currentAddress')) headerRows.push({ label: 'Current Address', value: val('currentAddress') });
    if (val('letterDate')) headerRows.push({ label: 'Letter Date', value: val('letterDate') });

    const sections = [{ heading: 'Borrower', rows: headerRows }];

    collectRows().forEach(function (r, i) {
      if (!r.address && !r.dates && !r.reason && !r.explanation) return;
      const rows = [];
      if (r.address) rows.push({ label: 'Address', value: r.address });
      if (r.dates) rows.push({ label: 'Dates', value: r.dates });
      if (r.reason) rows.push({ label: 'Reason', value: r.reason });
      if (r.explanation) rows.push({ label: 'Explanation', value: r.explanation });
      sections.push({ heading: 'Address ' + (i + 1), rows: rows });
    });

    return { title: 'Address Letter of Explanation', sections: sections };
  }

  /* ---- MISMO prepop ---- */
  // mismo-embed.js's applyToAddressLox already populates name + current
  // address on its own. We additionally seed the first repeating row
  // with the prior residence so the LO has a starting point.
  function seedFromMismo(parsed) {
    if (!parsed) return;
    if (parsed.borrowerName) setVal('borrowerName', parsed.borrowerName);
    if (parsed.loanNumber) setVal('loanNumber', parsed.loanNumber);
    if (parsed.currentResidenceAddress) setVal('currentAddress', parsed.currentResidenceAddress);

    if (parsed.previousResidenceAddress && rowsEl) {
      const existing = collectRows();
      // Don't overwrite a row the user has already started.
      const empty = !existing.length || existing.every(function (r) {
        return !r.address && !r.dates && !r.reason && !r.explanation;
      });
      if (empty) {
        if (rowsEl) rowsEl.innerHTML = '';
        addRow({
          address: parsed.previousResidenceAddress,
          dates: '',
          reason: 'Prior residence',
          explanation: 'I previously lived at this address; current residence is shown above.'
        });
      }
    }
  }

  /* ---- Init ---- */
  document.addEventListener('DOMContentLoaded', function () {
    if (!val('letterDate')) setVal('letterDate', todayLong());

    // Seed with one empty row to invite the user.
    addRow({});

    if (addBtn) addBtn.addEventListener('click', function () { addRow({}); });

    const dlBtn = document.getElementById('btnAddressLoxDownloadPdf');
    if (dlBtn) dlBtn.addEventListener('click', function () { downloadPdf(this); });

    // Track when the user types into the preview so we stop
    // overwriting their edits.
    const preview = document.getElementById('letterPreview');
    if (preview) {
      preview.addEventListener('input', function () { previewDirty = true; });
    }
    const resetBtn = document.getElementById('loxResetPreview');
    if (resetBtn) {
      resetBtn.addEventListener('click', function (e) {
        e.preventDefault();
        previewDirty = false;
        generateLetter();
      });
    }

    ['borrowerName', 'loanNumber', 'currentAddress', 'letterDate'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', generateLetter);
        el.addEventListener('change', generateLetter);
      }
    });

    generateLetter();

    if (window.MSFG && MSFG.DocActions) MSFG.DocActions.register(getEmailData);
    if (window.MSFG && MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('address-lox', getEmailData);
    }
    // Add-to-Session uses the same styled PDF as Download so the
    // report archives what the LO would actually send.
    if (window.MSFG && MSFG.DocActions && typeof MSFG.DocActions.registerCapture === 'function') {
      MSFG.DocActions.registerCapture(function () {
        return MSFG.fetch(MSFG.apiUrl('/api/pdf/address-lox'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collectPdfPayload())
        }).then(function (resp) {
          if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
          return resp.arrayBuffer();
        }).then(function (buf) {
          return {
            pdfBytes: new Uint8Array(buf),
            name: 'Address LOX',
            icon: '📍',
            slug: 'address-lox',
            data: getEmailData(),
            filename: 'Address-LOX.pdf'
          };
        });
      });
    }

    // The shared mismo-embed.js dispatcher already populates a few base
    // fields. Listen too so we can also seed the first repeating row.
    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_MISMO') return;
      const payload = e.data.payload;
      seedFromMismo(payload && payload.parsed);
      generateLetter();
    });
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
      }
    } catch (_e) { /* ignore */ }
  });
})();
