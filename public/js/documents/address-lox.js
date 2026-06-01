(function () {
  'use strict';

  const rowsEl = document.getElementById('addressRows');
  const addBtn = document.getElementById('addAddressRow');

  const val = MSFG.val;
  const setVal = MSFG.setVal;
  const todayLong = MSFG.formatDateLong;

  // Shared multi-borrower list (wired in onReady).
  let borrowers = null;

  // Opening paragraph: auto-personalized until the user edits it. The SAME
  // resolved text feeds both the preview and the PDF (single source of truth).
  let introDirty = false;
  function personalizedIntro() {
    const selected = borrowers ? borrowers.getSelected() : [];
    const nm = MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; }));
    const loan = val('loanNumber');
    return 'I, ' + (nm || 'the borrower') + (loan ? ' (Loan #' + loan + ')' : '') +
      ', am writing to provide an explanation regarding the address(es) shown on my records.';
  }
  function resolveIntro() {
    const el = document.getElementById('loxIntro');
    if (introDirty && el && el.value.trim()) return el.value;
    return personalizedIntro();
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
          + '<label>Date range (optional)</label>'
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
      regenerate();
    });
    div.addEventListener('input', regenerate);
    div.addEventListener('change', regenerate);
    return div;
  }

  function addRow(values) {
    if (!rowsEl) return;
    rowsEl.appendChild(buildRow(values));
    regenerate();
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
     The preview is contenteditable so the LO can hand-edit the final
     letter. LetterDoc owns the dirty flag; while dirty it won't call
     generate(), so field/row edits stop overwriting manual changes
     until "Reset preview" clears it. */

  // Gated rebuild — assigned from LetterDoc once initialised. The dynamic
  // address rows call this so their edits respect the dirty-preview gate.
  let regenerate = function () {};

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const selected = borrowers ? borrowers.getSelected() : [];
    const names = selected.map(function (b) { return b.name; });
    const borrowerNames = MSFG.Borrowers.joinNames(names);
    const loanNum = val('loanNumber');
    const currentAddr = val('currentAddress');
    const letterDate = val('letterDate') || todayLong();
    const rows = collectRows().filter(function (r) {
      return r.address || r.dates || r.reason || r.explanation;
    });

    if (!borrowerNames && !rows.length) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your letter of explanation.</p>';
      return;
    }

    // Keep the editable opening-paragraph field in sync until the user edits it.
    const introEl = document.getElementById('loxIntro');
    if (introEl && !introDirty) introEl.value = personalizedIntro();
    const intro = resolveIntro();

    let html = '<div class="letter-content">';
    html += '<p class="letter-date">' + MSFG.escHtml(letterDate) + '</p>';
    html += '<p>To Whom It May Concern,</p>';
    html += '<p>' + MSFG.escHtml(intro).replace(/\n/g, '<br>') + '</p>';
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
    html += '<p>Sincerely,</p>';
    // Blank signature lines (one per selected borrower); the name appears in the
    // body, not pre-printed on the line — printed for wet signing.
    const signers = names.length ? names : [''];
    html += '<table style="margin-top:var(--space-lg);">';
    signers.slice(0, 8).forEach(function (nm) {
      html += '<tr><td style="padding-right:1.5rem;">____________________________</td>'
        + '<td>' + (nm ? '<strong>' + MSFG.escHtml(nm) + '</strong><br>' : '')
        + '<span class="text-muted">Signature</span></td></tr>';
    });
    html += '</table>';
    html += '</div>';

    preview.innerHTML = html;
  }

  /* ---- Download PDF ---- */
  function collectPdfPayload() {
    const selected = borrowers ? borrowers.getSelected() : [];
    const ls = (window.MSFG && window.MSFG.LetterSettings) ? window.MSFG.LetterSettings.read() : null;
    return {
      borrowers: selected,
      borrowerNames: MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; })),
      loanNumber: val('loanNumber'),
      currentAddress: val('currentAddress'),
      letterDate: val('letterDate') || todayLong(),
      intro: resolveIntro(),
      addresses: collectRows(),
      letterSettings: ls
    };
  }

  /* ---- Email / report extractor ---- */

  function getEmailData() {
    const selected = borrowers ? borrowers.getSelected() : [];
    const borrowerNames = MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; }));
    const headerRows = [];
    if (borrowerNames) headerRows.push({ label: 'Borrower(s)', value: borrowerNames });
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
  // Seeds the shared borrowers list from parsed.borrowers and fills the
  // current address. We additionally seed the first repeating row with the
  // prior residence so the LO has a starting point.
  function seedFromMismo(parsed) {
    if (!parsed) return;
    if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);
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
  const doc = MSFG.LetterDoc.init({
    slug: 'address-lox',
    name: 'Address LOX',
    icon: '📍',
    filename: 'Address-LOX.pdf',
    downloadBtnId: 'btnAddressLoxDownloadPdf',
    resetBtnId: 'loxResetPreview',
    dateFieldId: 'letterDate',
    previewFields: ['loanNumber', 'currentAddress', 'letterDate'],
    generate: generateLetter,
    collectPayload: collectPdfPayload,
    getEmailData: getEmailData,
    applyMismo: seedFromMismo,
    onReady: function (api) {
      regenerate = api.regenerate;
      borrowers = MSFG.Borrowers.init({ containerId: 'borrowersList', addBtnId: 'addBorrower', onChange: api.regenerate });
      // Opening-paragraph edits stop the auto-personalization and re-render.
      const introEl = document.getElementById('loxIntro');
      if (introEl) introEl.addEventListener('input', function () { introDirty = true; api.regenerate(); });
      // Seed one empty row to invite the user; wire "add address".
      addRow({});
      if (addBtn) addBtn.addEventListener('click', function () { addRow({}); });
    }
  });
  regenerate = doc.regenerate;
})();
