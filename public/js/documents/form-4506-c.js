(function() {
  'use strict';

  function isForm4506Page() {
    const main = document.querySelector('.site-main');
    return !!(main && main.dataset.docSlug === 'form-4506-c');
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function selectedText(id) {
    const el = document.getElementById(id);
    if (!el || el.tagName !== 'SELECT') return '';
    const opt = el.options[el.selectedIndex];
    return opt ? opt.text : '';
  }

  function buildPreview() {
    const box = document.getElementById('f4506Preview');
    if (!box) return;

    const parts = [];
    parts.push('<div class="form-4506-c__preview-block"><h4>Loan number</h4><p>' + MSFG.escHtml(val('f4506LoanNumber') || '—') + '</p></div>');

    parts.push('<div class="form-4506-c__preview-block"><h4>Taxpayer</h4><p><strong>' + MSFG.escHtml(val('f4506TaxpayerName') || '—') + '</strong>');
    if (val('f4506SpouseName')) {
      parts.push('<br>Spouse: ' + MSFG.escHtml(val('f4506SpouseName')));
    }
    parts.push('</p></div>');

    const addr = [
      val('f4506AddressLine'),
      val('f4506Apt'),
      [val('f4506City'), val('f4506State'), val('f4506Zip')].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ');
    parts.push('<div class="form-4506-c__preview-block"><h4>Current address</h4><p>' + MSFG.escHtml(addr || '—') + '</p></div>');

    if (val('f4506PrevAddress')) {
      parts.push('<div class="form-4506-c__preview-block"><h4>Previous address</h4><p>' + MSFG.escHtml(val('f4506PrevAddress')) + '</p></div>');
    }

    parts.push(
      '<div class="form-4506-c__preview-block"><h4>Transcript</h4><p>' +
      MSFG.escHtml(selectedText('f4506TaxForm')) + ' · ' + MSFG.escHtml(selectedText('f4506TranscriptType')) +
      '<br>Year(s): ' + MSFG.escHtml(val('f4506TaxYears') || '—') + '</p></div>'
    );

    if (val('f4506Notes')) {
      parts.push('<div class="form-4506-c__preview-block"><h4>Notes</h4><p>' + MSFG.escHtml(val('f4506Notes')).replace(/\n/g, '<br>') + '</p></div>');
    }

    if (val('f4506ThirdPartyName') || val('f4506ThirdPartyAddress')) {
      parts.push(
        '<div class="form-4506-c__preview-block"><h4>Third party</h4><p>' +
        MSFG.escHtml(val('f4506ThirdPartyName')) +
        (val('f4506ThirdPartyCaf') ? '<br>CAF: ' + MSFG.escHtml(val('f4506ThirdPartyCaf')) : '') +
        (val('f4506ThirdPartyAddress') ? '<br>' + MSFG.escHtml(val('f4506ThirdPartyAddress')) : '') +
        '</p></div>'
      );
    }

    box.innerHTML = parts.join('');
  }

  function clearThirdPartyFields() {
    ['f4506ThirdPartyName', 'f4506ThirdPartyAddress', 'f4506ThirdPartyCaf'].forEach(function(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** API / parent-window payloads use the same ids as the form inputs. */
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
    const selTax = document.getElementById('f4506TaxForm');
    const selTr = document.getElementById('f4506TranscriptType');
    return {
      f4506LoanNumber: val('f4506LoanNumber'),
      f4506TaxpayerName: val('f4506TaxpayerName'),
      f4506SpouseName: val('f4506SpouseName'),
      f4506Ssn: val('f4506Ssn'),
      f4506SpouseSsn: val('f4506SpouseSsn'),
      f4506AddressLine: val('f4506AddressLine'),
      f4506Apt: val('f4506Apt'),
      f4506City: val('f4506City'),
      f4506State: val('f4506State'),
      f4506Zip: val('f4506Zip'),
      f4506PrevAddress: val('f4506PrevAddress'),
      f4506TaxForm: selTax ? selTax.value : '',
      f4506TranscriptType: selTr ? selTr.value : '',
      f4506TaxYears: val('f4506TaxYears'),
      f4506Notes: val('f4506Notes'),
      f4506ThirdPartyName: val('f4506ThirdPartyName'),
      f4506ThirdPartyAddress: val('f4506ThirdPartyAddress'),
      f4506ThirdPartyCaf: val('f4506ThirdPartyCaf')
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
    const hint = document.getElementById('f4506InvestorDbHint');
    if (btn) {
      btn.disabled = true;
      btn.dataset._lbl = btn.dataset._lbl || btn.textContent;
      btn.textContent = 'Building PDF…';
    }
    try {
      const resp = await fetch(MSFG.apiUrl('/api/pdf/form-4506-c'), {
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
      a.download = 'IRS-Form-4506-C-filled.pdf';
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
    const hint = document.getElementById('f4506InvestorDbHint');
    if (!id) return;
    if (hint && !opts.silent) {
      hint.hidden = false;
      hint.textContent = 'Loading investor…';
    }
    clearThirdPartyFields();
    try {
      const r = await fetch(MSFG.apiUrl('/api/investors/' + encodeURIComponent(id) + '/form-4506c-fields'));
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
            ? 'Investor fields API not found (404). Same host / PUBLIC_APP_ORIGIN as the main Form 4506-C API.'
            : 'Request failed (HTTP ' + r.status + ').'
        );
      }
      if (!r.ok || !j.success) throw new Error(j.message || 'Request failed');
      applyInvestorFields(j.fields || {});
      if (hint && !opts.hintText) hint.textContent = 'Third party fields updated from database.';
      if (hint && opts.hintText) hint.textContent = opts.hintText;
    } catch (e) {
      console.error(e);
      if (hint) hint.textContent = e.message || 'Could not load investor row.';
    }
  }

  function getEmailData() {
    return {
      title: 'IRS Form 4506-C (worksheet)',
      sections: [
        {
          heading: 'Loan',
          rows: [{ label: 'Loan number', value: val('f4506LoanNumber') }]
        },
        {
          heading: 'Taxpayer',
          rows: [
            { label: 'Primary borrower', value: val('f4506TaxpayerName') },
            { label: 'Spouse / second borrower', value: val('f4506SpouseName') }
          ]
        },
        {
          heading: 'Address',
          rows: [{ label: 'Current', value: [val('f4506AddressLine'), val('f4506Apt'), val('f4506City'), val('f4506State'), val('f4506Zip')].filter(Boolean).join(', ') }]
        },
        {
          heading: 'Request',
          rows: [
            { label: 'Form', value: selectedText('f4506TaxForm') },
            { label: 'Transcript type', value: selectedText('f4506TranscriptType') },
            { label: 'Year(s)', value: val('f4506TaxYears') },
            { label: 'Notes', value: val('f4506Notes') }
          ]
        },
        {
          heading: 'Third party',
          rows: (function() {
            const tp = [];
            if (val('f4506InvestorSelect')) {
              tp.push({ label: 'Investor (database)', value: selectedText('f4506InvestorSelect') });
            }
            tp.push(
              { label: 'Name', value: val('f4506ThirdPartyName') },
              { label: 'Address', value: val('f4506ThirdPartyAddress') },
              { label: 'CAF', value: val('f4506ThirdPartyCaf') }
            );
            return tp;
          })()
        }
      ]
    };
  }

  async function loadInvestorDropdown(loanForMatch) {
    const sel = document.getElementById('f4506InvestorSelect');
    const hint = document.getElementById('f4506InvestorDbHint');
    if (!sel) return;

    const loan = loanForMatch != null ? String(loanForMatch).trim() : '';
    const url = MSFG.apiUrl('/api/investors/for-form-4506c') + (loan ? '?loan=' + encodeURIComponent(loan) : '');

    try {
      const r = await fetch(url);
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
    const sel = document.getElementById('f4506InvestorSelect');
    if (!sel) return;

    const id = sel.value;
    if (!id) {
      clearThirdPartyFields();
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

    const invSel = document.getElementById('f4506InvestorSelect');
    if (invSel) {
      invSel.addEventListener('change', onInvestorSelectChange);
    }
    loadInvestorDropdown('');

    document.querySelectorAll('#btnF4506DownloadPdf, #btnF4506DownloadPdfFooter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        downloadFilledPdf(btn);
      });
    });

    window.addEventListener('message', function(e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_INVESTOR_FORM4506C') return;
      applyInvestorFields(e.data.fields || {});
    });

    window.addEventListener('message', function(e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_MISMO') return;
      if (!isForm4506Page()) return;
      setTimeout(function() {
        const loan = val('f4506LoanNumber');
        loadInvestorDropdown(loan);
      }, 0);
    });

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('form-4506-c', getEmailData);
    }
    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    buildPreview();
  });
})();
