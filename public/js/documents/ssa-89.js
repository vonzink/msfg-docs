(function() {
  'use strict';

  function isSsa89Page() {
    const main = document.querySelector('.site-main');
    return !!(main && main.dataset.docSlug === 'ssa-89');
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function checked(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

  /** Map worksheet-checkbox ids → mapper key used by lib/pdf/ssa89Pdf.js */
  const REASON_IDS = {
    sSsaReasonMortgage: 'mortgage',
    sSsaReasonBankAccount: 'bankAccount',
    sSsaReasonCreditCard: 'creditCard',
    sSsaReasonLoan: 'loan',
    sSsaReasonRetirement: 'retirement',
    sSsaReasonJob: 'job',
    sSsaReasonLicense: 'license',
    sSsaReasonOther: 'other'
  };

  function collectReasons() {
    const out = {};
    Object.keys(REASON_IDS).forEach(function(domId) {
      out[REASON_IDS[domId]] = checked(domId);
    });
    return out;
  }

  function reasonsLabels() {
    const labelMap = {
      sSsaReasonMortgage: 'Mortgage',
      sSsaReasonBankAccount: 'Banking',
      sSsaReasonCreditCard: 'Credit card',
      sSsaReasonLoan: 'Loan',
      sSsaReasonRetirement: 'Retirement',
      sSsaReasonJob: 'Apply for a job',
      sSsaReasonLicense: 'Licensing',
      sSsaReasonOther: 'Other'
    };
    const out = [];
    Object.keys(labelMap).forEach(function(id) {
      if (checked(id)) out.push(labelMap[id]);
    });
    return out;
  }

  function buildPreview() {
    const box = document.getElementById('sSsaPreview');
    if (!box) return;

    const parts = [];
    parts.push('<div class="ssa-89__preview-block"><h4>Loan number</h4><p>' + MSFG.escHtml(val('sSsaLoanNumber') || '—') + '</p></div>');

    const dob = val('sSsaDob');
    const ssn = val('sSsaSsn');
    parts.push(
      '<div class="ssa-89__preview-block"><h4>Borrower</h4><p><strong>' + MSFG.escHtml(val('sSsaPrintedName') || '—') + '</strong>'
      + (dob ? '<br>DOB: ' + MSFG.escHtml(dob) : '')
      + (ssn ? '<br>SSN: ' + MSFG.escHtml(ssn) : '')
      + '</p></div>'
    );

    const reasons = reasonsLabels();
    let reasonText = reasons.join(', ') || '—';
    if (checked('sSsaReasonOther') && val('sSsaOtherText')) {
      reasonText = reasonText + ' (' + val('sSsaOtherText') + ')';
    }
    parts.push('<div class="ssa-89__preview-block"><h4>Reason for verification</h4><p>' + MSFG.escHtml(reasonText) + '</p></div>');

    parts.push(
      '<div class="ssa-89__preview-block"><h4>Requesting company</h4><p>'
      + MSFG.escHtml(val('sSsaCompanyName') || '—')
      + (val('sSsaCompanyAddress') ? '<br>' + MSFG.escHtml(val('sSsaCompanyAddress')) : '')
      + '</p></div>'
    );

    if (val('sSsaAgentName') || val('sSsaAgentAddress')) {
      parts.push(
        '<div class="ssa-89__preview-block"><h4>Agent</h4><p>'
        + MSFG.escHtml(val('sSsaAgentName'))
        + (val('sSsaAgentAddress') ? '<br>' + MSFG.escHtml(val('sSsaAgentAddress')) : '')
        + '</p></div>'
      );
    }

    parts.push(
      '<div class="ssa-89__preview-block"><h4>Validity &amp; signature</h4><p>'
      + 'Valid for: ' + MSFG.escHtml(val('sSsaValidFor') || '—') + ' day(s)'
      + (val('sSsaInitial') ? ' · Initial: ' + MSFG.escHtml(val('sSsaInitial')) : '')
      + (val('sSsaDateSigned') ? '<br>Date signed: ' + MSFG.escHtml(val('sSsaDateSigned')) : '')
      + (val('sSsaRelationship') ? '<br>Signed by: ' + MSFG.escHtml(val('sSsaRelationship')) : '')
      + '</p></div>'
    );

    box.innerHTML = parts.join('');
  }

  // (Removed) clearCompanyFields + applyInvestorFields — investor company /
  // agent info now travels with the investor's pre-filled SSA-89 PDF
  // (selected via the investor picker), not via DB-hydrated worksheet inputs.

  function collectWorksheetPayload() {
    return {
      sSsaLoanNumber: val('sSsaLoanNumber'),
      sSsaPrintedName: val('sSsaPrintedName'),
      sSsaDob: val('sSsaDob'),
      sSsaSsn: val('sSsaSsn'),
      sSsaReasons: collectReasons(),
      sSsaOtherText: val('sSsaOtherText'),
      sSsaCompanyName: val('sSsaCompanyName'),
      sSsaCompanyAddress: val('sSsaCompanyAddress'),
      sSsaAgentName: val('sSsaAgentName'),
      sSsaAgentAddress: val('sSsaAgentAddress'),
      sSsaValidFor: val('sSsaValidFor'),
      sSsaInitial: val('sSsaInitial'),
      sSsaSignature: val('sSsaSignature'),
      sSsaDateSigned: val('sSsaDateSigned'),
      sSsaRelationship: val('sSsaRelationship'),
      investorPdfRef: getInvestorPdfRef()
    };
  }

  /** Read the picker's selected option and return the {investorId, docId}
   *  pair the backend uses to swap the PDF base. Returns null when no
   *  investor is selected (backend then falls back to the blank SSA-89 PDF). */
  function getInvestorPdfRef() {
    const sel = document.getElementById('sSsaInvestorSelect');
    if (!sel) return null;
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value || !opt.dataset.investorId || !opt.dataset.docId) return null;
    return { investorId: opt.dataset.investorId, docId: opt.dataset.docId };
  }

  async function readErrorBody(resp) {
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const text = await resp.text();
    if (ct.indexOf('application/json') !== -1) {
      try {
        const j = JSON.parse(text);
        return j.message || text.slice(0, 200);
      } catch (e) {
        return text.slice(0, 200);
      }
    }
    if (resp.status === 404 && text.indexOf('<!DOCTYPE') === 0) {
      return 'PDF API not found (404). Open this page from the MSFG Document Creator server (same host as /api), redeploy the latest app, or set PUBLIC_APP_ORIGIN to the API base URL.';
    }
    return text.slice(0, 200) || ('HTTP ' + resp.status);
  }

  async function downloadFilledPdf(btn) {
    const hint = document.getElementById('sSsaInvestorDbHint');
    if (btn) {
      btn.disabled = true;
      btn.dataset._lbl = btn.dataset._lbl || btn.textContent;
      btn.textContent = 'Building PDF…';
    }
    try {
      const resp = await MSFG.fetch(MSFG.apiUrl('/api/pdf/ssa-89'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectWorksheetPayload())
      });
      if (!resp.ok) {
        const detail = await readErrorBody(resp);
        throw new Error(detail || 'PDF export failed');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SSA-89-filled.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Filled PDF downloaded.';
      }
    } catch (e) {
      console.error(e);
      alert(e.message || 'Could not generate PDF.');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (btn.dataset._lbl) btn.textContent = btn.dataset._lbl;
      }
    }
  }

  // (Removed) fetchAndApplyInvestorFields — picking an investor now selects
  // their pre-filled SSA-89 PDF as the base; the backend stamps borrower
  // worksheet fields on top of the company/agent block already in the PDF.

  function getEmailData() {
    const reasonRow = reasonsLabels().join(', ') + (
      checked('sSsaReasonOther') && val('sSsaOtherText') ? ' (' + val('sSsaOtherText') + ')' : ''
    );
    return {
      title: 'SSA-89 (worksheet)',
      sections: [
        {
          heading: 'Loan',
          rows: [{ label: 'Loan number', value: val('sSsaLoanNumber') }]
        },
        {
          heading: 'Borrower',
          rows: [
            { label: 'Printed name', value: val('sSsaPrintedName') },
            { label: 'Date of birth', value: val('sSsaDob') },
            { label: 'SSN', value: val('sSsaSsn') }
          ]
        },
        {
          heading: 'Verification',
          rows: [{ label: 'Reason(s)', value: reasonRow }]
        },
        {
          heading: 'Requesting company',
          rows: [
            { label: 'Name', value: val('sSsaCompanyName') },
            { label: 'Address', value: val('sSsaCompanyAddress') }
          ]
        },
        {
          heading: 'Agent',
          rows: [
            { label: 'Name', value: val('sSsaAgentName') },
            { label: 'Address', value: val('sSsaAgentAddress') }
          ]
        },
        {
          heading: 'Validity & signature',
          rows: [
            { label: 'Valid for (days)', value: val('sSsaValidFor') },
            { label: 'Initial', value: val('sSsaInitial') },
            { label: 'Signed by', value: val('sSsaSignature') },
            { label: 'Date signed', value: val('sSsaDateSigned') },
            { label: 'Relationship', value: val('sSsaRelationship') }
          ]
        }
      ]
    };
  }

  /** Populate the investor picker from /dashboard-docs/list?docType=form-ssa89.
   *  Each option carries the investor's pre-filled SSA-89 PDF as data-doc-id;
   *  picking one tells the backend (via investorPdfRef in the fill request)
   *  to use that PDF as the AcroForm base instead of the blank SSA template. */
  async function loadInvestorDropdown() {
    const sel = document.getElementById('sSsaInvestorSelect');
    const hint = document.getElementById('sSsaInvestorDbHint');
    if (!sel) return;

    try {
      const r = await MSFG.fetch(MSFG.apiUrl('/dashboard-docs/list?docType=form-ssa89'));
      let j = {};
      try { j = await r.json(); } catch (_e) { throw new Error('Investor docs API returned invalid JSON.'); }
      if (!r.ok || !j.success) throw new Error(j.message || ('Request failed (HTTP ' + r.status + ').'));

      while (sel.options.length > 1) sel.remove(1);

      const buckets = j.investors || [];
      const total = buckets.reduce(function(n, b) { return n + (b.docs ? b.docs.length : 0); }, 0);

      if (total) {
        buckets
          .slice()
          .sort(function(a, b) { return String(a.investorName || '').localeCompare(String(b.investorName || '')); })
          .forEach(function(bucket) {
            bucket.docs.forEach(function(doc) {
              const opt = document.createElement('option');
              opt.value = bucket.investorId + ':' + doc.docId;
              opt.dataset.investorId = String(bucket.investorId);
              opt.dataset.docId = String(doc.docId);
              opt.textContent = (bucket.investorName || ('Investor #' + bucket.investorId))
                + ' — ' + (doc.fileName || ('Doc #' + doc.docId));
              sel.appendChild(opt);
            });
          });
        sel.disabled = false;
      } else {
        sel.disabled = false;
      }

      if (hint) {
        hint.hidden = false;
        if (total) {
          hint.textContent = total + ' pre-filled SSA-89(s) available across ' + buckets.length + ' investor(s).';
        } else {
          hint.textContent = 'No investor has uploaded an SSA-89 tagged "Form SSA-89" in the dashboard yet.';
        }
      }
      sel.value = '';
    } catch (e) {
      console.error(e);
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Could not load investor list.';
      }
    }
  }

  function onInvestorSelectChange() {
    const sel = document.getElementById('sSsaInvestorSelect');
    const hint = document.getElementById('sSsaInvestorDbHint');
    if (!sel) return;
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) {
      if (hint) hint.textContent = 'No investor selected — will use the blank SSA-89 template.';
      return;
    }
    if (hint) hint.textContent = 'Will use ' + opt.textContent + ' as the PDF base.';
  }

  document.addEventListener('DOMContentLoaded', function() {
    const body = document.querySelector('.doc-page__body');
    if (body) {
      body.addEventListener('input', buildPreview);
      body.addEventListener('change', buildPreview);
    }

    const invSel = document.getElementById('sSsaInvestorSelect');
    if (invSel) {
      invSel.addEventListener('change', onInvestorSelectChange);
    }
    loadInvestorDropdown();

    document.querySelectorAll('#btnSsaDownloadPdf, #btnSsaDownloadPdfFooter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        downloadFilledPdf(btn);
      });
    });

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('ssa-89', getEmailData);
    }
    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    buildPreview();
  });
})();
