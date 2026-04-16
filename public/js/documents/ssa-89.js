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

  function clearCompanyFields() {
    ['sSsaCompanyName', 'sSsaCompanyAddress', 'sSsaAgentName', 'sSsaAgentAddress', 'sSsaValidFor'].forEach(function(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function applyInvestorFields(fields) {
    if (!fields || typeof fields !== 'object') return;
    Object.keys(fields).forEach(function(k) {
      const el = document.getElementById(k);
      if (!el || typeof el.value === 'undefined') return;
      const v = fields[k];
      if (v == null || v === '') return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    buildPreview();
  }

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
      sSsaRelationship: val('sSsaRelationship')
    };
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

  async function fetchAndApplyInvestorFields(id, opts) {
    opts = opts || {};
    const hint = document.getElementById('sSsaInvestorDbHint');
    if (!id) return;
    if (hint && !opts.silent) {
      hint.hidden = false;
      hint.textContent = 'Loading investor…';
    }
    clearCompanyFields();
    try {
      const r = await MSFG.fetch(MSFG.apiUrl('/api/investors/' + encodeURIComponent(id) + '/ssa-89-fields'));
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const raw = await r.text();
      let j = {};
      if (ct.indexOf('application/json') !== -1) {
        try {
          j = JSON.parse(raw);
        } catch (e) {
          throw new Error('Invalid JSON from investor API.');
        }
      } else if (!r.ok) {
        throw new Error(
          raw.indexOf('<!DOCTYPE') === 0
            ? 'Investor fields API not found (404). Same host / PUBLIC_APP_ORIGIN as the main SSA-89 API.'
            : 'Request failed (HTTP ' + r.status + ').'
        );
      }
      if (!r.ok || !j.success) throw new Error(j.message || 'Request failed');
      applyInvestorFields(j.fields || {});
      if (hint && !opts.hintText) hint.textContent = 'Company / agent fields updated from database.';
      if (hint && opts.hintText) hint.textContent = opts.hintText;
    } catch (e) {
      console.error(e);
      if (hint) hint.textContent = e.message || 'Could not load investor row.';
    }
  }

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

  async function loadInvestorDropdown(loanForMatch) {
    const sel = document.getElementById('sSsaInvestorSelect');
    const hint = document.getElementById('sSsaInvestorDbHint');
    if (!sel) return;

    const loan = loanForMatch != null ? String(loanForMatch).trim() : '';
    const url = MSFG.apiUrl('/api/investors/for-ssa-89') + (loan ? '?loan=' + encodeURIComponent(loan) : '');

    try {
      const r = await MSFG.fetch(url);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const raw = await r.text();
      let j = {};
      if (ct.indexOf('application/json') !== -1) {
        try {
          j = JSON.parse(raw);
        } catch (parseErr) {
          throw new Error('Investor API returned invalid JSON.');
        }
      } else if (!r.ok && raw.indexOf('<!DOCTYPE') === 0) {
        throw new Error(
          'Investor API not found (404). Use the MSFG Node server on this host (see PORT in .env), or set PUBLIC_APP_ORIGIN to your API origin if the UI is hosted elsewhere.'
        );
      } else {
        throw new Error('Unexpected response from investor API (HTTP ' + r.status + ').');
      }
      if (!r.ok) throw new Error(j.message || 'Request failed');

      while (sel.options.length > 1) sel.remove(1);

      if (hint) {
        hint.hidden = false;
        if (!j.configured && j.message) {
          hint.textContent = j.message;
        } else if (j.investors && j.investors.length) {
          hint.textContent = (j.investors.length + ' investor(s) loaded.') + (j.matchHint ? ' ' + j.matchHint : '');
        } else {
          hint.textContent = j.configured ? 'No rows in investors table yet.' : (j.message || '');
        }
      }

      if (j.investors && j.investors.length) {
        j.investors.forEach(function(inv) {
          const opt = document.createElement('option');
          opt.value = String(inv.id);
          opt.textContent = inv.label || ('Investor #' + inv.id);
          sel.appendChild(opt);
        });
        sel.disabled = false;
      } else {
        sel.disabled = !j.configured;
      }

      if (j.autoSelectId) {
        sel.value = String(j.autoSelectId);
        await fetchAndApplyInvestorFields(j.autoSelectId, {
          silent: true,
          hintText: j.matchHint || 'Investor matched for this loan.'
        });
      } else {
        sel.value = '';
      }
    } catch (e) {
      console.error(e);
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Could not load investor list.';
      }
    }
  }

  async function onInvestorSelectChange() {
    const sel = document.getElementById('sSsaInvestorSelect');
    if (!sel) return;

    const id = sel.value;
    if (!id) {
      clearCompanyFields();
      buildPreview();
      return;
    }

    await fetchAndApplyInvestorFields(id);
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
    loadInvestorDropdown('');

    document.querySelectorAll('#btnSsaDownloadPdf, #btnSsaDownloadPdfFooter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        downloadFilledPdf(btn);
      });
    });

    window.addEventListener('message', function(e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_INVESTOR_SSA89') return;
      applyInvestorFields(e.data.fields || {});
    });

    window.addEventListener('message', function(e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_MISMO') return;
      if (!isSsa89Page()) return;
      setTimeout(function() {
        const loan = val('sSsaLoanNumber');
        loadInvestorDropdown(loan);
      }, 0);
    });

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('ssa-89', getEmailData);
    }
    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    buildPreview();
  });
})();
