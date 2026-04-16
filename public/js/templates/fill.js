'use strict';

(function () {
  var configEl = document.getElementById('tplConfig');
  var config = null;
  if (configEl) { try { config = JSON.parse(configEl.textContent); } catch (_e) { /* ignore */ } }
  if (!config) config = window.__TPL_CONFIG__; // legacy fallback
  if (!config) return;

  var sectionsEl = document.getElementById('tplFillSections');
  var downloadBtn = document.getElementById('tplDownloadBtn');

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
      html = '<div class="calc-section"><p class="text-muted text-center">No visible fields configured. <a href="' + MSFG.appUrl('/templates/' + config.slug + '/edit') + '">Edit this template</a> to set up field labels.</p></div>';
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

  /* ---- Download filled PDF ---- */
  downloadBtn.addEventListener('click', function () {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Generating...';

    var values = collectValues();

    MSFG.fetch(MSFG.apiUrl('/templates/api/' + config.id + '/fill'), {
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

  /* ---- MISMO auto-fill support ----
     Workspace broadcasts { type: 'MSFG_MISMO', payload: { xmlString, parsed } }.
     Each field with a mismoPath set in the editor pulls its value from parsed[mismoPath]. */
  function applyMismo(parsed) {
    if (!parsed) return;
    config.fields.forEach(function (f) {
      if (!f.mismoPath) return;
      var value = parsed[f.mismoPath];
      if (value == null || value === '') return;
      var inputId = 'tplf_' + sanitizeId(f.pdfField);
      var el = document.getElementById(inputId);
      if (!el) return;
      if (el.type === 'checkbox') {
        // MISMO values won't usually drive checkboxes, but support truthy strings just in case
        el.checked = value === true || value === 'true' || value === '1' || value === 'on';
      } else {
        el.value = String(value);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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

  renderForm();
})();
