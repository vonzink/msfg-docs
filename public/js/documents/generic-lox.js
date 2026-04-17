(function () {
  'use strict';

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

  function collectPayload() {
    const signers = ['loxSigner1', 'loxSigner2', 'loxSigner3', 'loxSigner4', 'loxSigner5']
      .map((id) => ({ name: val(id) }))
      .filter((s, idx, all) => {
        // Drop trailing blanks so the PDF doesn't render empty signature lines
        // past the last named signer; keep blanks if a later slot has a value
        // (preserves the sequence the LO entered).
        if (s.name) return true;
        for (let j = idx + 1; j < all.length; j++) if (all[j].name) return true;
        return false;
      });
    return {
      borrowerNames: val('loxBorrowerNames'),
      loanNumber: val('loxLoanNumber'),
      subjectPropertyAddress: val('loxPropertyAddress'),
      letterDate: val('loxLetterDate') || todayLong(),
      topic: val('loxTopic'),
      explanation: val('loxExplanation'),
      signers
    };
  }

  async function downloadPdf(btn) {
    if (btn) { btn.disabled = true; btn.dataset._lbl = btn.dataset._lbl || btn.textContent; btn.textContent = 'Building PDF…'; }
    try {
      const resp = await MSFG.fetch(MSFG.apiUrl('/api/pdf/generic-lox'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectPayload())
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Letter-of-Explanation.pdf';
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

  function getEmailData() {
    const sigList = ['loxSigner1', 'loxSigner2', 'loxSigner3', 'loxSigner4', 'loxSigner5']
      .map((id, i) => val(id) || ('Borrower ' + (i + 1)))
      .join(', ');
    return {
      title: '📝 Letter of Explanation',
      sections: [
        {
          heading: 'Loan & borrower',
          rows: [
            { label: 'Loan number', value: val('loxLoanNumber') },
            { label: 'Borrower(s)', value: val('loxBorrowerNames') },
            { label: 'Property', value: val('loxPropertyAddress') },
            { label: 'Letter date', value: val('loxLetterDate') }
          ]
        },
        {
          heading: 'Subject & explanation',
          rows: [
            { label: 'Subject', value: val('loxTopic') },
            { label: 'Explanation', value: val('loxExplanation') }
          ]
        },
        {
          heading: 'Signers',
          rows: [{ label: 'On signature lines', value: sigList }]
        }
      ]
    };
  }

  /* MISMO prepop */
  function applyMismo(parsed) {
    if (!parsed) return;
    setVal('loxLoanNumber', parsed.loanNumber);
    setVal('loxPropertyAddress', parsed.propertyAddress);
    // Borrower(s) — combine primary + co-borrower if both present
    const borrowers = [parsed.borrowerName, parsed.coBorrowerName].filter(Boolean).join(', ');
    if (borrowers) setVal('loxBorrowerNames', borrowers);
    // Pre-fill signer slots with the borrower names so the PDF caption
    // labels read with real names instead of "Borrower 1 / Borrower 2".
    if (parsed.borrowerName) setVal('loxSigner1', parsed.borrowerName);
    if (parsed.coBorrowerName) setVal('loxSigner2', parsed.coBorrowerName);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!val('loxLetterDate')) setVal('loxLetterDate', todayLong());

    document.getElementById('btnLoxDownloadPdf').addEventListener('click', function () {
      downloadPdf(this);
    });

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

    if (window.MSFG && MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('generic-lox', getEmailData);
    }
    if (window.MSFG && MSFG.DocActions) {
      MSFG.DocActions.register(getEmailData);
      if (typeof MSFG.DocActions.registerCapture === 'function') {
        MSFG.DocActions.registerCapture(function () {
          return MSFG.fetch(MSFG.apiUrl('/api/pdf/generic-lox'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectPayload())
          }).then(function (resp) {
            if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
            return resp.arrayBuffer();
          }).then(function (buf) {
            return {
              pdfBytes: new Uint8Array(buf),
              name: 'Letter of Explanation',
              icon: '📝',
              slug: 'generic-lox',
              data: getEmailData(),
              filename: 'Letter-of-Explanation.pdf'
            };
          });
        });
      }
    }
  });
})();
