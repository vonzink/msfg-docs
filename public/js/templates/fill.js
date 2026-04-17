'use strict';

(function () {
  var configEl = document.getElementById('tplConfig');
  var config = null;
  if (configEl) { try { config = JSON.parse(configEl.textContent); } catch (_e) { /* ignore */ } }
  if (!config) config = window.__TPL_CONFIG__; // legacy fallback
  if (!config) return;

  var sectionsEl = document.getElementById('tplFillSections');
  var downloadBtn = document.getElementById('tplDownloadBtn');
  var viewBtn = document.getElementById('tplViewBtn');
  var saveDraftBtn = document.getElementById('tplSaveDraftBtn');
  var draftStatusEl = document.getElementById('tplDraftStatus');

  // Only show fields that have a label
  var visibleFields = config.fields.filter(function (f) {
    return f.label && f.label.trim();
  });

  // Sort by order
  visibleFields.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

  // Group by group name
  var groups = [];
  var groupMap = {};
  visibleFields.forEach(function (f) {
    var g = f.group || 'General';
    if (!groupMap[g]) {
      groupMap[g] = [];
      groups.push(g);
    }
    groupMap[g].push(f);
  });

  /* ---- Render form ---- */
  function renderForm() {
    var html = '';
    groups.forEach(function (groupName, gIdx) {
      var gFields = groupMap[groupName];
      html += '<div class="calc-section">';
      html += '<h2><span class="section-number">' + (gIdx + 1) + '</span> ' + MSFG.escHtml(groupName) + '</h2>';
      html += '<div class="form-grid u-grid-2col">';

      gFields.forEach(function (f) {
        var inputId = 'tplf_' + sanitizeId(f.pdfField);

        if (f.type === 'checkbox') {
          html += '<div class="form-group tpl-fill-checkbox">';
          html += '<label class="tpl-checkbox-label">';
          html += '<input type="checkbox" id="' + inputId + '" data-pdf-field="' + MSFG.escHtml(f.pdfField) + '">';
          html += ' ' + MSFG.escHtml(f.label);
          html += '</label>';
          html += '</div>';
        } else if (f.type === 'dropdown' && f.options && f.options.length) {
          html += '<div class="form-group">';
          html += '<label for="' + inputId + '">' + MSFG.escHtml(f.label) + '</label>';
          html += '<select id="' + inputId + '" data-pdf-field="' + MSFG.escHtml(f.pdfField) + '">';
          html += '<option value="">Select...</option>';
          f.options.forEach(function (opt) {
            html += '<option value="' + MSFG.escHtml(opt) + '">' + MSFG.escHtml(opt) + '</option>';
          });
          html += '</select>';
          html += '</div>';
        } else {
          html += '<div class="form-group">';
          html += '<label for="' + inputId + '">' + MSFG.escHtml(f.label) + '</label>';
          html += '<input type="text" id="' + inputId + '" data-pdf-field="' + MSFG.escHtml(f.pdfField) + '"'
            + ' placeholder="' + MSFG.escHtml(f.placeholder || '') + '"'
            + ' autocomplete="off">';
          html += '</div>';
        }
      });

      html += '</div></div>';
    });

    if (!visibleFields.length) {
      var editUrl = config.editUrl || ('/templates/' + config.slug + '/edit');
      html = '<div class="calc-section"><p class="text-muted text-center">No visible fields configured. <a href="' + MSFG.appUrl(editUrl) + '">Edit this template</a> to set up field labels.</p></div>';
    }

    sectionsEl.innerHTML = html;
  }

  function sanitizeId(pdfField) {
    return pdfField.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
  }

  /* ---- Collect form values ---- */
  function collectValues() {
    var values = {};
    sectionsEl.querySelectorAll('[data-pdf-field]').forEach(function (el) {
      var key = el.dataset.pdfField;
      if (el.type === 'checkbox') {
        values[key] = el.checked;
      } else {
        values[key] = el.value;
      }
    });
    return values;
  }

  function apiBasePath() {
    return config.apiBase || ('/templates/api/' + config.id);
  }

  /* ---- Download filled PDF ---- */
  downloadBtn.addEventListener('click', function () {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Generating...';

    var values = collectValues();

    MSFG.fetch(MSFG.apiUrl(apiBasePath() + '/fill'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: values })
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'Fill failed'); });
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (config.slug || 'filled') + '-filled.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        alert('Error: ' + err.message);
      })
      .finally(function () {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download filled PDF';
      });
  });

  /* ---- Auto-fill source dispatch ----
     Each field's editor-configured source string (`type:key`) tells us
     where the prepopulation value comes from. Two source types today:
       - mismo:<key>      → look up parsed[key] from the MISMO payload
       - investor:<key>   → look up investorFields[key] from the picker
     Legacy: a bare `mismoPath` value is treated as `mismo:<value>`. */

  function getFieldSource(f) {
    if (f.source) {
      var s = String(f.source);
      var idx = s.indexOf(':');
      if (idx === -1) return { type: 'mismo', key: s };
      return { type: s.slice(0, idx), key: s.slice(idx + 1) };
    }
    if (f.mismoPath) return { type: 'mismo', key: String(f.mismoPath) };
    return null;
  }

  function applyValueToField(f, value) {
    if (value == null || value === '') return;
    var inputId = 'tplf_' + sanitizeId(f.pdfField);
    var el = document.getElementById(inputId);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = value === true || value === 'true' || value === '1' || value === 'on';
    } else {
      el.value = String(value);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Index fields by source type so we can show/hide pickers conditionally. */
  function fieldsByType(type) {
    return config.fields.filter(function (f) {
      var s = getFieldSource(f);
      return s && s.type === type;
    });
  }

  var hasInvestorFields = fieldsByType('investor').length > 0;
  var lastLoanNumber = '';

  /* ---- MISMO ---- */

  function applyMismo(parsed) {
    if (!parsed) return;
    config.fields.forEach(function (f) {
      var s = getFieldSource(f);
      if (!s || s.type !== 'mismo') return;
      applyValueToField(f, parsed[s.key]);
    });
    // If the template has any investor mappings, kick off (or refresh) the
    // investor list using the imported loan number for auto-match.
    if (parsed.loanNumber) lastLoanNumber = String(parsed.loanNumber);
    if (hasInvestorFields) loadInvestorList(lastLoanNumber);
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== 'MSFG_MISMO') return;
    var payload = e.data.payload;
    applyMismo(payload && payload.parsed);
  });

  // If this fill page loaded after MISMO was already imported into the workspace,
  // ask the parent to re-broadcast so we don't render an empty form.
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
    }
  } catch (_e) { /* ignore */ }

  /* ---- Investor record ----
     Mirrors the SSA-89 / 4506-C investor flow but uses generic endpoints:
       GET /api/investors/for-template?loan=<n>     → list (auto-match)
       GET /api/investors/<id>/template-fields      → canonical fields
     Picker section in fill.ejs is shown only when at least one field is
     mapped to an investor source. */

  function applyInvestor(investorFields) {
    if (!investorFields) return;
    config.fields.forEach(function (f) {
      var s = getFieldSource(f);
      if (!s || s.type !== 'investor') return;
      applyValueToField(f, investorFields[s.key]);
    });
  }

  function setInvestorHint(text) {
    var hint = document.getElementById('tplInvestorHint');
    if (!hint) return;
    if (text) {
      hint.hidden = false;
      hint.textContent = text;
    } else {
      hint.hidden = true;
      hint.textContent = '';
    }
  }

  function loadInvestorList(loan) {
    var sel = document.getElementById('tplInvestorSelect');
    if (!sel) return;
    var url = MSFG.apiUrl('/api/investors/for-template') + (loan ? '?loan=' + encodeURIComponent(loan) : '');
    MSFG.fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        // Reset to just the placeholder option, then append fresh list
        while (sel.options.length > 1) sel.remove(1);
        if (j.investors && j.investors.length) {
          j.investors.forEach(function (inv) {
            var opt = document.createElement('option');
            opt.value = String(inv.id);
            opt.textContent = inv.label || ('Investor #' + inv.id);
            sel.appendChild(opt);
          });
          sel.disabled = false;
        } else {
          sel.disabled = !j.configured;
        }

        if (!j.configured && j.message) setInvestorHint(j.message);
        else if (j.matchHint) setInvestorHint(j.matchHint);
        else if (j.investors && j.investors.length) setInvestorHint(j.investors.length + ' investor(s) loaded.');
        else setInvestorHint(j.configured ? 'No rows in investors table yet.' : '');

        if (j.autoSelectId) {
          sel.value = String(j.autoSelectId);
          loadInvestorFields(j.autoSelectId);
        }
      })
      .catch(function (err) {
        console.error('[Templates] investor list', err);
        setInvestorHint('Could not load investor list.');
      });
  }

  function loadInvestorFields(id) {
    if (!id) return;
    MSFG.fetch(MSFG.apiUrl('/api/investors/' + encodeURIComponent(id) + '/template-fields'))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.success) applyInvestor(j.fields || {});
      })
      .catch(function (err) { console.error('[Templates] investor fields', err); });
  }

  function initInvestorPicker() {
    var section = document.getElementById('tplInvestorSection');
    var sel = document.getElementById('tplInvestorSelect');
    if (!section || !sel) return;
    if (!hasInvestorFields) return;
    section.hidden = false;
    sel.addEventListener('change', function () { loadInvestorFields(sel.value); });
    loadInvestorList(''); // initial load with no loan match
  }

  /* ---- Print / Email / Add-to-Report data extractor ----
     Walks the rendered form by group/section and produces the canonical
     email-modal shape: { title, sections: [{ heading, rows: [{label, value}] }] }.
     Empty fields are skipped to keep the email/preview clean. */
  function getEmailData() {
    var sections = groups.map(function (groupName) {
      var rows = [];
      groupMap[groupName].forEach(function (f) {
        var inputId = 'tplf_' + sanitizeId(f.pdfField);
        var el = document.getElementById(inputId);
        if (!el) return;
        var value;
        if (el.type === 'checkbox') {
          value = el.checked ? 'Yes' : '';
        } else {
          value = (el.value || '').trim();
        }
        if (!value) return;
        rows.push({ label: f.label, value: value });
      });
      return { heading: groupName, rows: rows };
    }).filter(function (sec) { return sec.rows.length > 0; });

    return {
      title: (config.icon ? config.icon + ' ' : '') + config.name,
      sections: sections
    };
  }

  // Register with shared modules. Both checks are guards: the modules load
  // earlier in the layout (doc-email + report) so the registrations should
  // succeed; ReportTemplates is lazy-loaded by report.js so the second check
  // matches the pattern used by every other document JS file in this repo.
  if (window.MSFG && MSFG.DocActions && typeof MSFG.DocActions.register === 'function') {
    MSFG.DocActions.register(getEmailData);
  }
  if (window.MSFG && MSFG.ReportTemplates && typeof MSFG.ReportTemplates.registerExtractor === 'function') {
    MSFG.ReportTemplates.registerExtractor('pdf-template-' + config.slug, getEmailData);
  }

  /* ---- Capture for Session Report ----
     Workspace panel calls this to fetch the freshly-filled PDF and
     stash it in the session report alongside structured data. */
  if (window.MSFG && MSFG.DocActions && typeof MSFG.DocActions.registerCapture === 'function') {
    MSFG.DocActions.registerCapture(function () {
      var values = collectValues();
      return MSFG.fetch(MSFG.apiUrl(apiBasePath() + '/fill'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: values })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error((d && d.message) || 'PDF generation failed'); });
        return r.arrayBuffer();
      }).then(function (buf) {
        return {
          pdfBytes: new Uint8Array(buf),
          name: config.name,
          icon: config.icon || '📄',
          slug: 'pdf-template-' + config.slug,
          data: getEmailData(),
          filename: (config.slug || 'template') + '-filled.pdf'
        };
      });
    });
  }

  /* ---- View filled PDF in a new tab ----
     Fetches the filled PDF (with Cognito Bearer via MSFG.fetch), wraps
     the bytes in a blob URL, then window.open() pops a new tab. Browser
     PDF viewer handles Save As / Print / zoom natively from there. */
  if (viewBtn) {
    viewBtn.addEventListener('click', function () {
      var values = collectValues();
      viewBtn.disabled = true;
      var originalHtml = viewBtn.innerHTML;
      viewBtn.textContent = 'Opening…';
      MSFG.fetch(MSFG.apiUrl(apiBasePath() + '/fill?inline=1'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: values })
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error((d && d.message) || 'View failed'); });
          return r.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          // Keep the blob alive long enough for the new tab to finish
          // loading it. 30s is comfortable; revoked after.
          setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        })
        .catch(function (err) { alert('Error: ' + err.message); })
        .finally(function () {
          viewBtn.disabled = false;
          viewBtn.innerHTML = originalHtml;
        });
    });
  }

  /* ---- Save draft / resume ----
     Persists the current form values server-side, scoped per-user and
     per-template. On page open we auto-load any saved draft so the
     user resumes where they left off. */
  function setDraftStatus(text) {
    if (!draftStatusEl) return;
    draftStatusEl.textContent = text || '';
  }

  function applyDraftValues(values) {
    if (!values || typeof values !== 'object') return;
    Object.keys(values).forEach(function (pdfField) {
      var inputId = 'tplf_' + sanitizeId(pdfField);
      var el = document.getElementById(inputId);
      if (!el) return;
      var v = values[pdfField];
      if (el.type === 'checkbox') {
        el.checked = v === true || v === 'true' || v === '1' || v === 'on';
      } else if (v != null) {
        el.value = String(v);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function loadDraft() {
    // Only local templates support drafts today; dashboard-sourced docs
    // have their own apiBase and don't expose /draft endpoints.
    if (config.apiBase) return;
    MSFG.fetch(MSFG.apiUrl(apiBasePath() + '/draft'))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.success || !j.draft) return;
        applyDraftValues(j.draft.values || {});
        var when = j.draft.savedAt ? new Date(j.draft.savedAt).toLocaleString() : '';
        setDraftStatus(when ? 'Draft restored — last saved ' + when : 'Draft restored');
      })
      .catch(function (err) { console.warn('[Templates] draft load failed:', err); });
  }

  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', function () {
      if (config.apiBase) {
        setDraftStatus('Drafts are only supported on your own uploaded templates.');
        return;
      }
      saveDraftBtn.disabled = true;
      setDraftStatus('Saving…');
      MSFG.fetch(MSFG.apiUrl(apiBasePath() + '/draft'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: collectValues() })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.success) throw new Error((j && j.message) || 'Save failed');
          var when = j.draft && j.draft.savedAt ? new Date(j.draft.savedAt).toLocaleTimeString() : '';
          setDraftStatus(when ? 'Draft saved at ' + when : 'Draft saved');
        })
        .catch(function (err) { setDraftStatus('Save failed: ' + err.message); })
        .finally(function () { saveDraftBtn.disabled = false; });
    });
  }

  renderForm();
  initInvestorPicker();
  loadDraft();
})();
