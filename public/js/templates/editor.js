'use strict';

(function () {
  var config = window.__TPL_CONFIG__;
  if (!config) return;

  var fieldListEl = document.getElementById('edFieldList');
  var fieldCountEl = document.getElementById('edFieldCount');
  var saveFieldsBtn = document.getElementById('edSaveFields');
  var redetectBtn = document.getElementById('edRedetect');
  var fieldStatusEl = document.getElementById('edFieldStatus');
  var saveMetaBtn = document.getElementById('edSaveMeta');
  var metaStatusEl = document.getElementById('edMetaStatus');

  var fields = config.fields.slice(); // working copy

  /* ---- Render field rows ---- */
  function renderFields() {
    fieldCountEl.textContent = fields.length;
    var html = '<div class="tpl-field-header">'
      + '<span class="tpl-fh-order">#</span>'
      + '<span class="tpl-fh-pdf">PDF field name</span>'
      + '<span class="tpl-fh-label">Label</span>'
      + '<span class="tpl-fh-group">Group</span>'
      + '<span class="tpl-fh-type">Type</span>'
      + '<span class="tpl-fh-placeholder">Placeholder</span>'
      + '</div>';

    fields.forEach(function (f, idx) {
      html += '<div class="tpl-field-row" data-idx="' + idx + '">'
        + '<span class="tpl-fr-order">'
        + '<button type="button" class="tpl-move-btn" data-dir="up" data-idx="' + idx + '" ' + (idx === 0 ? 'disabled' : '') + '>&uarr;</button>'
        + '<button type="button" class="tpl-move-btn" data-dir="down" data-idx="' + idx + '" ' + (idx === fields.length - 1 ? 'disabled' : '') + '>&darr;</button>'
        + '</span>'
        + '<span class="tpl-fr-pdf" title="' + MSFG.escHtml(f.pdfField) + '">' + MSFG.escHtml(truncate(f.pdfField, 40)) + '</span>'
        + '<input class="tpl-fr-label" value="' + MSFG.escHtml(f.label) + '" data-key="label" data-idx="' + idx + '" placeholder="(hidden if empty)">'
        + '<input class="tpl-fr-group" value="' + MSFG.escHtml(f.group) + '" data-key="group" data-idx="' + idx + '" placeholder="General">'
        + '<select class="tpl-fr-type" data-key="type" data-idx="' + idx + '">'
        + typeOption('text', f.type)
        + typeOption('checkbox', f.type)
        + typeOption('dropdown', f.type)
        + typeOption('radio', f.type)
        + '</select>'
        + '<input class="tpl-fr-placeholder" value="' + MSFG.escHtml(f.placeholder || '') + '" data-key="placeholder" data-idx="' + idx + '" placeholder="hint text">'
        + '</div>';
    });

    fieldListEl.innerHTML = html;
    bindFieldEvents();
  }

  function typeOption(val, current) {
    return '<option value="' + val + '"' + (current === val ? ' selected' : '') + '>' + val + '</option>';
  }

  function truncate(str, max) {
    return str.length > max ? '...' + str.slice(-(max - 3)) : str;
  }

  function bindFieldEvents() {
    // Input changes
    fieldListEl.querySelectorAll('input, select').forEach(function (el) {
      el.addEventListener('change', function () {
        var idx = parseInt(el.dataset.idx, 10);
        var key = el.dataset.key;
        if (!isNaN(idx) && key && fields[idx]) {
          fields[idx][key] = el.value;
        }
      });
    });

    // Move buttons
    fieldListEl.querySelectorAll('.tpl-move-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        var dir = btn.dataset.dir;
        var swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= fields.length) return;
        var tmp = fields[idx];
        fields[idx] = fields[swapIdx];
        fields[swapIdx] = tmp;
        // Update order
        fields.forEach(function (f, i) { f.order = i; });
        renderFields();
      });
    });
  }

  /* ---- Save fields ---- */
  saveFieldsBtn.addEventListener('click', function () {
    saveFieldsBtn.disabled = true;
    fieldStatusEl.textContent = 'Saving...';

    // Sync latest input values from DOM before saving
    fieldListEl.querySelectorAll('input, select').forEach(function (el) {
      var idx = parseInt(el.dataset.idx, 10);
      var key = el.dataset.key;
      if (!isNaN(idx) && key && fields[idx]) {
        fields[idx][key] = el.value;
      }
    });

    fetch(MSFG.apiUrl('/templates/api/' + config.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fields })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        saveFieldsBtn.disabled = false;
        if (data.success) {
          fieldStatusEl.textContent = 'Saved.';
          config.fields = data.template.fields;
          fields = config.fields.slice();
        } else {
          fieldStatusEl.textContent = data.message || 'Save failed.';
        }
      })
      .catch(function (err) {
        saveFieldsBtn.disabled = false;
        fieldStatusEl.textContent = 'Error: ' + err.message;
      });
  });

  /* ---- Re-detect fields ---- */
  redetectBtn.addEventListener('click', function () {
    if (!confirm('Re-detect fields from the PDF? This will overwrite your current labels and grouping.')) return;
    redetectBtn.disabled = true;
    fieldStatusEl.textContent = 'Re-detecting...';

    // Fetch a fresh config by re-reading the PDF fields server-side
    // We do this by fetching the template PDF and having the server re-analyze
    fetch(MSFG.apiUrl('/templates/api/' + config.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) throw new Error(data.message);
        // We need to ask the server to re-detect — use a PUT with a special flag
        return fetch(MSFG.apiUrl('/templates/api/' + config.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redetect: true })
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        redetectBtn.disabled = false;
        if (data.success) {
          fieldStatusEl.textContent = 'Re-detected ' + data.template.fields.length + ' fields.';
          config.fields = data.template.fields;
          fields = config.fields.slice();
          renderFields();
        } else {
          fieldStatusEl.textContent = data.message || 'Re-detect failed.';
        }
      })
      .catch(function (err) {
        redetectBtn.disabled = false;
        fieldStatusEl.textContent = 'Error: ' + err.message;
      });
  });

  /* ---- Save metadata ---- */
  saveMetaBtn.addEventListener('click', function () {
    saveMetaBtn.disabled = true;
    metaStatusEl.textContent = 'Saving...';

    fetch(MSFG.apiUrl('/templates/api/' + config.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('edName').value,
        category: document.getElementById('edCategory').value,
        icon: document.getElementById('edIcon').value,
        description: document.getElementById('edDescription').value
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        saveMetaBtn.disabled = false;
        if (data.success) {
          metaStatusEl.textContent = 'Saved.';
          // Update page title
          document.title = 'Edit — ' + data.template.name;
        } else {
          metaStatusEl.textContent = data.message || 'Save failed.';
        }
      })
      .catch(function (err) {
        saveMetaBtn.disabled = false;
        metaStatusEl.textContent = 'Error: ' + err.message;
      });
  });

  renderFields();
})();
