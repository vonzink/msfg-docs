'use strict';

(function () {
  var config = window.__TPL_CONFIG__;
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

  /* ---- MISMO auto-fill support ---- */
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'mismoData') return;
    var mismo = e.data.payload;
    if (!mismo) return;

    // Auto-fill fields that have mismoPath set
    config.fields.forEach(function (f) {
      if (!f.mismoPath || !mismo[f.mismoPath]) return;
      var inputId = 'tplf_' + sanitizeId(f.pdfField);
      var el = document.getElementById(inputId);
      if (el) {
        el.value = mismo[f.mismoPath];
        el.dispatchEvent(new Event('change'));
      }
    });
  });

  renderForm();
})();
