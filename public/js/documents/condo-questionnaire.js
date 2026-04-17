(function () {
  'use strict';

  /** Condo Questionnaire is a thin wrapper around the existing
   *  dashboard-doc fill flow. Each investor uploads their own
   *  questionnaire PDF in admin-settings (tagged "form-condo"); this
   *  page lists those uploads and embeds the picked one in an iframe
   *  that runs the same fill UI as msfg-docs templates. Borrower
   *  fields hydrate from MISMO via the existing prepop pipeline. */

  const sel = document.getElementById('condoInvestorSelect');
  const hint = document.getElementById('condoInvestorHint');
  const formSection = document.getElementById('condoFormSection');
  const iframe = document.getElementById('condoFillFrame');
  const editLink = document.getElementById('condoEditMappingLink');

  async function loadInvestors() {
    if (!sel) return;
    try {
      const r = await MSFG.fetch(MSFG.apiUrl('/dashboard-docs/list?docType=form-condo'));
      let j = {};
      try { j = await r.json(); } catch (_e) { throw new Error('Investor docs API returned invalid JSON.'); }
      if (!r.ok || !j.success) throw new Error(j.message || ('Request failed (HTTP ' + r.status + ').'));

      while (sel.options.length > 1) sel.remove(1);

      const buckets = j.investors || [];
      const total = buckets.reduce((n, b) => n + (b.docs ? b.docs.length : 0), 0);

      buckets
        .slice()
        .sort((a, b) => String(a.investorName || '').localeCompare(String(b.investorName || '')))
        .forEach((bucket) => {
          bucket.docs.forEach((doc) => {
            const opt = document.createElement('option');
            opt.value = bucket.investorId + ':' + doc.docId;
            opt.dataset.investorId = String(bucket.investorId);
            opt.dataset.docId = String(doc.docId);
            opt.textContent = (bucket.investorName || ('Investor #' + bucket.investorId))
              + ' — ' + (doc.fileName || ('Doc #' + doc.docId));
            sel.appendChild(opt);
          });
        });

      if (hint) {
        hint.hidden = false;
        hint.textContent = total
          ? total + ' pre-filled condo questionnaire(s) available across ' + buckets.length + ' investor(s).'
          : 'No investor has uploaded a condo questionnaire tagged "Form Condo" yet.';
      }
    } catch (err) {
      console.error('[Condo] investor list', err);
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Could not load investor list.';
      }
    }
  }

  function onPick() {
    const opt = sel && sel.selectedOptions[0];
    if (!opt || !opt.value || !opt.dataset.investorId || !opt.dataset.docId) {
      if (formSection) formSection.hidden = true;
      iframe.removeAttribute('src');
      return;
    }
    const fillUrl = MSFG.appUrl('/dashboard-docs/' + opt.dataset.investorId + '/' + opt.dataset.docId + '/fill') + '?embed=1';
    const editUrl = MSFG.appUrl('/dashboard-docs/' + opt.dataset.investorId + '/' + opt.dataset.docId + '/edit');
    iframe.src = fillUrl;
    if (editLink) editLink.href = editUrl;
    if (formSection) formSection.hidden = false;
  }

  /* ---- Print + Add-to-Session capture ----
     Print = window.print() of the embedded iframe doc (browser handles
     the PDF view). Add-to-Session captures the filled PDF by reaching
     into the iframe's MSFG.DocActions.captureForReport so the workspace
     panel button gets a proper PDF (not just a "Condo Questionnaire"
     placeholder). */
  function getEmailData() {
    const opt = sel && sel.selectedOptions[0];
    return {
      title: '🏢 Condo Questionnaire',
      sections: [
        {
          heading: 'Investor PDF',
          rows: [{ label: 'Selected', value: opt && opt.value ? opt.textContent : '— none —' }]
        }
      ]
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (sel) sel.addEventListener('change', onPick);
    loadInvestors();

    if (window.MSFG && MSFG.DocActions) {
      MSFG.DocActions.register(getEmailData);
      // Capture proxies through to the embedded iframe's capture handler
      // so the workspace's Add-to-Session captures the actual filled PDF
      // for whichever investor is currently selected.
      if (typeof MSFG.DocActions.registerCapture === 'function') {
        MSFG.DocActions.registerCapture(function () {
          const child = iframe && iframe.contentWindow;
          const childActions = child && child.MSFG && child.MSFG.DocActions;
          if (childActions && typeof childActions.captureForReport === 'function') {
            return childActions.captureForReport();
          }
          return Promise.reject(new Error('Pick an investor first to capture the questionnaire.'));
        });
      }
    }
  });
})();
