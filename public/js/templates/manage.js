'use strict';

(function () {
  var dropzone = document.getElementById('tplDropzone');
  var fileInput = document.getElementById('tplFile');
  var browseBtn = document.getElementById('tplBrowseBtn');
  var filenameEl = document.getElementById('tplFilename');
  var uploadBtn = document.getElementById('tplUploadBtn');
  var uploadForm = document.getElementById('tplUploadForm');
  var statusEl = document.getElementById('tplUploadStatus');
  var listEl = document.getElementById('tplList');
  var listEmptyEl = document.getElementById('tplListEmpty');

  /* ---- Drag & drop ---- */
  browseBtn.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('click', function (e) {
    if (e.target === browseBtn || e.target === fileInput) return;
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.add('tpl-dropzone--active');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.remove('tpl-dropzone--active');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer.files;
    if (files.length && files[0].type === 'application/pdf') {
      fileInput.files = files;
      onFileSelected(files[0]);
    }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) onFileSelected(fileInput.files[0]);
  });

  function onFileSelected(file) {
    filenameEl.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
    uploadBtn.disabled = false;
    // Auto-fill name if empty
    var nameInput = document.getElementById('tplName');
    if (!nameInput.value.trim()) {
      var base = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
      nameInput.value = base;
    }
  }

  /* ---- Upload ---- */
  uploadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!fileInput.files.length) return;

    uploadBtn.disabled = true;
    statusEl.textContent = 'Uploading and detecting fields...';

    var fd = new FormData();
    fd.append('pdf', fileInput.files[0]);
    fd.append('name', document.getElementById('tplName').value);
    fd.append('category', document.getElementById('tplCategory').value);
    fd.append('description', document.getElementById('tplDescription').value);

    MSFG.fetch(MSFG.apiUrl('/templates/api/upload'), { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) {
          statusEl.textContent = data.message || 'Upload failed.';
          uploadBtn.disabled = false;
          return;
        }
        var tpl = data.template;
        statusEl.textContent = 'Detected ' + tpl.fields.length + ' fields. Redirecting...';
        // Redirect to editor
        window.location.href = MSFG.appUrl('/templates/' + tpl.slug + '/edit');
      })
      .catch(function (err) {
        statusEl.textContent = 'Error: ' + err.message;
        uploadBtn.disabled = false;
      });
  });

  /* ---- Load template list ---- */
  function loadList() {
    MSFG.fetch(MSFG.apiUrl('/templates/api/list'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success || !data.templates.length) {
          listEmptyEl.textContent = 'No templates yet. Upload a PDF above to get started.';
          return;
        }
        listEmptyEl.style.display = 'none';
        renderList(data.templates);
      })
      .catch(function () {
        listEmptyEl.textContent = 'Failed to load templates.';
      });
  }

  function renderList(templates) {
    var html = '';
    templates.forEach(function (tpl) {
      html += '<div class="tpl-card" data-id="' + MSFG.escHtml(tpl.id) + '">'
        + '<div class="tpl-card__icon">' + MSFG.escHtml(tpl.icon || '📄') + '</div>'
        + '<div class="tpl-card__body">'
        + '<h3 class="tpl-card__name">' + MSFG.escHtml(tpl.name) + '</h3>'
        + '<p class="tpl-card__meta">'
        + MSFG.escHtml(tpl.category) + ' &middot; '
        + tpl.fieldCount + ' fields'
        + '</p>'
        + '</div>'
        + '<div class="tpl-card__actions">'
        + '<a href="' + MSFG.appUrl('/templates/' + tpl.slug + '/fill') + '" class="btn btn-sm btn-primary">Fill</a>'
        + '<a href="' + MSFG.appUrl('/templates/' + tpl.slug + '/edit') + '" class="btn btn-sm btn-secondary">Edit</a>'
        + '<button type="button" class="btn btn-sm btn-danger tpl-delete-btn" data-id="' + MSFG.escHtml(tpl.id) + '">Delete</button>'
        + '</div>'
        + '</div>';
    });
    listEl.innerHTML = html;

    // Bind delete buttons
    listEl.querySelectorAll('.tpl-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this template? This cannot be undone.')) return;
        var id = btn.dataset.id;
        MSFG.fetch(MSFG.apiUrl('/templates/api/' + id), { method: 'DELETE' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.success) {
              btn.closest('.tpl-card').remove();
              // Check if list is now empty
              if (!listEl.querySelector('.tpl-card')) {
                listEmptyEl.textContent = 'No templates yet.';
                listEmptyEl.style.display = '';
              }
            }
          });
      });
    });
  }

  loadList();
})();
