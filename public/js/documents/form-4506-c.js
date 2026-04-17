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

  // (Removed) clearThirdPartyFields + applyInvestorFields — third-party
  // info now travels with the investor's pre-filled PDF (selected via the
  // investor picker), not via DB-hydrated worksheet inputs.

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
      f4506ThirdPartyCaf: val('f4506ThirdPartyCaf'),
      // Optional split IVES (5a) overrides — when filled, the backend
      // uses these instead of parsing f4506ThirdPartyAddress.
      f4506IvesParticipantId: val('f4506IvesParticipantId'),
      f4506IvesSorMailbox: val('f4506IvesSorMailbox'),
      f4506IvesCity: val('f4506IvesCity'),
      f4506IvesState: val('f4506IvesState'),
      f4506IvesZip: val('f4506IvesZip'),
      // 5d Client block (lender contact). Optional — only used when
      // no investor PDF is selected.
      f4506ClientName: val('f4506ClientName'),
      f4506ClientPhone: val('f4506ClientPhone'),
      f4506ClientStreet: val('f4506ClientStreet'),
      f4506ClientCity: val('f4506ClientCity'),
      f4506ClientState: val('f4506ClientState'),
      f4506ClientZip: val('f4506ClientZip'),
      investorPdfRef: getInvestorPdfRef()
    };
  }

  /** Read the picker's selected option and return the {investorId, docId}
   *  pair the backend uses to swap the PDF base. Returns null when no
   *  investor is selected (backend then falls back to the blank IRS PDF). */
  function getInvestorPdfRef() {
    const sel = document.getElementById('f4506InvestorSelect');
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
    const hint = document.getElementById('f4506InvestorDbHint');
    if (btn) {
      btn.disabled = true;
      btn.dataset._lbl = btn.dataset._lbl || btn.textContent;
      btn.textContent = 'Building PDF…';
    }
    try {
      const resp = await MSFG.fetch(MSFG.apiUrl('/api/pdf/form-4506-c'), {
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

  // No field-application step needed — picking an investor selects their
  // pre-filled PDF as the base, and the backend stamps borrower fields on
  // top. The third-party block (5a / 5d) is already in the investor's PDF.
  // Selection state is read directly off the <option>'s data-* attrs at
  // submit time (collectWorksheetPayload), not stored anywhere extra.

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

  /** Populate the investor picker from /dashboard-docs/list?docType=form-4506c.
   *  Each option carries the investor's pre-filled 4506-C PDF as data-doc-id;
   *  picking one tells the backend (via investorPdfRef in the fill request)
   *  to use that PDF as the AcroForm base instead of the blank IRS template. */
  async function loadInvestorDropdown() {
    const sel = document.getElementById('f4506InvestorSelect');
    const hint = document.getElementById('f4506InvestorDbHint');
    if (!sel) return;

    try {
      const r = await MSFG.fetch(MSFG.apiUrl('/dashboard-docs/list?docType=form-4506c'));
      let j = {};
      try {
        j = await r.json();
      } catch (_e) {
        throw new Error('Investor docs API returned invalid JSON.');
      }
      if (!r.ok || !j.success) throw new Error(j.message || ('Request failed (HTTP ' + r.status + ').'));

      while (sel.options.length > 1) sel.remove(1);

      const buckets = j.investors || [];
      // Flatten to one option per (investor, doc). Investors with multiple
      // 4506-Cs uploaded show each filename so the LO picks the right one.
      const total = buckets.reduce(function(n, b) { return n + (b.docs ? b.docs.length : 0); }, 0);

      if (total) {
        buckets
          .slice()
          .sort(function(a, b) { return String(a.investorName || '').localeCompare(String(b.investorName || '')); })
          .forEach(function(bucket) {
            bucket.docs.forEach(function(doc) {
              const opt = document.createElement('option');
              // Composite value lets handlers parse out both pieces. Each
              // option also carries them on data-* for clarity.
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
          hint.textContent = total + ' pre-filled 4506-C(s) available across ' + buckets.length + ' investor(s).';
        } else {
          hint.textContent = 'No investor has uploaded a 4506-C tagged "Form 4506-C" in the dashboard yet.';
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
    const sel = document.getElementById('f4506InvestorSelect');
    const hint = document.getElementById('f4506InvestorDbHint');
    if (!sel) return;
    const opt = sel.selectedOptions[0];
    const manualBlock = document.getElementById('f4506ManualBlock');
    if (!opt || !opt.value) {
      if (hint) hint.textContent = 'No investor selected — will use the blank IRS template. Fill the manual IVES + Client fields below.';
      // Open the manual block since the LO needs to fill it.
      if (manualBlock) manualBlock.open = true;
      return;
    }
    if (hint) hint.textContent = 'Will use ' + opt.textContent + ' as the PDF base — IVES + Client blocks come from that PDF.';
    // Collapse the manual block since it's not needed when an investor
    // PDF is the source of truth.
    if (manualBlock) manualBlock.open = false;
  }

  /** Sync the four MM/DD/YYYY tax-year inputs into the hidden
   *  f4506TaxYears comma-list that the backend distributeTaxYears
   *  helper parses. We accept both bare years (e.g. "2023") and full
   *  MM/DD/YYYY — the backend already handles both, but guiding the
   *  user to MM/DD/YYYY makes the IRS form fill match exactly. */
  function syncTaxYearsHidden() {
    const slots = document.querySelectorAll('.f4506-tax-year');
    const parts = [];
    slots.forEach(function (s) {
      const v = String(s.value || '').trim();
      if (v) parts.push(v);
    });
    const hidden = document.getElementById('f4506TaxYears');
    if (hidden) hidden.value = parts.join(', ');
  }

  document.addEventListener('DOMContentLoaded', function() {
    const body = document.querySelector('.doc-page__body');
    if (body) {
      body.addEventListener('input', buildPreview);
      body.addEventListener('change', buildPreview);
    }

    // Per-slot tax-year inputs feed the hidden f4506TaxYears field.
    document.querySelectorAll('.f4506-tax-year').forEach(function (el) {
      el.addEventListener('input', syncTaxYearsHidden);
      el.addEventListener('change', syncTaxYearsHidden);
    });

    const invSel = document.getElementById('f4506InvestorSelect');
    if (invSel) {
      invSel.addEventListener('change', onInvestorSelectChange);
    }
    loadInvestorDropdown();

    document.querySelectorAll('#btnF4506DownloadPdf, #btnF4506DownloadPdfFooter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        downloadFilledPdf(btn);
      });
    });

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('form-4506-c', getEmailData);
    }
    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);
    // Workspace panel "Add to Session Report" → fetch the freshly-filled
    // PDF (same payload the Download button uses) so the actual
    // document gets archived in the session, not just a text extract.
    if (MSFG.DocActions && typeof MSFG.DocActions.registerCapture === 'function') {
      MSFG.DocActions.registerCapture(function () {
        return MSFG.fetch(MSFG.apiUrl('/api/pdf/form-4506-c'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collectWorksheetPayload())
        }).then(function (resp) {
          if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
          return resp.arrayBuffer();
        }).then(function (buf) {
          return {
            pdfBytes: new Uint8Array(buf),
            name: 'IRS Form 4506-C',
            icon: '📋',
            slug: 'form-4506-c',
            data: getEmailData(),
            filename: 'IRS-Form-4506-C-filled.pdf'
          };
        });
      });
    }

    buildPreview();
  });
})();
