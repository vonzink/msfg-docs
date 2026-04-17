/* =====================================================
   MSFG Document Creator — Session Report page
   Renders captured documents (filled PDFs embedded inline) with
   drag-to-reorder, per-item Remove, and bulk Print / Export PDF /
   Clear All. Mirrors msfg-calc's session-report UX so the workspace
   experience stays consistent across the two apps.
   ===================================================== */
(function () {
  'use strict';

  var itemsContainer = document.getElementById('reportItems');
  var emptyState = document.getElementById('reportEmpty');
  var actionsBar = document.getElementById('reportActions');
  var countEl = document.getElementById('reportCount');

  var reportPageEl = document.getElementById('reportPage');
  var cfg = {};
  try { cfg = JSON.parse(reportPageEl.dataset.siteConfig || '{}'); } catch (_e) { /* ignore */ }

  // Resolve the app's base path (e.g. "/docs") so we can call the
  // server-side merge endpoint without hard-coding it.
  var basePath = '';
  var rpScript = document.querySelector('script[src*="report-page"]');
  if (rpScript && rpScript.src) {
    var m = rpScript.src.match(/^https?:\/\/[^/]+(\/.*?)\/js\/report-page/);
    if (m && m[1]) basePath = m[1];
  }

  var DRAG_HANDLE_SVG =
    '<svg class="report-item__drag-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
      '<circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>' +
      '<circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>' +
      '<circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>' +
    '</svg>';

  function formatTime(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) +
           ' — ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- Build the body of a card ----
     Two modes:
     1. PDF mode  — item.pdfBase64 set (new Add-to-Session flow): the
                    actual filled PDF is wrapped in a blob URL and
                    loaded into an <iframe>. blob: is preferred over
                    data: because (a) far smaller DOM footprint when
                    inspecting / debugging and (b) the browser PDF
                    viewer hands us native paging/zoom/save-as for free.
     2. Data mode — fall back to the legacy structured-data render so
                    pre-PDF items (and items from documents without a
                    capture handler) still appear with something useful.
     The function returns a HTML string — an outer wrapper that gets
     populated with a real iframe element by attachPdfIframes() after
     it's appended to the DOM (we can't put a blob URL into innerHTML
     without leaking the URL when the card is removed). */
  function buildCardBody(item) {
    if (item.pdfBase64) {
      // Placeholder div — attachPdfIframes() resolves blob URLs and
      // inserts the iframe + tracks it for revoke on card removal.
      var nameAttr = escapeHtml(item.name + ' PDF preview');
      return '<div class="report-item__pdf-mount" data-pdf-id="' + escapeHtml(item.id) + '" data-pdf-title="' + nameAttr + '"></div>';
    }
    if (item.version === 2 && item.data && item.slug && window.MSFG && MSFG.ReportTemplates) {
      try { return MSFG.ReportTemplates.render(item.slug, item.data); }
      catch (_e) { /* fall through */ }
    }
    return '<p class="rpt-no-template">This item has no PDF attached. Re-add it from the workspace to capture the filled document.</p>';
  }

  // Track every blob URL we created so we can revoke them when items
  // get re-rendered (avoiding a leak that grows with each render).
  var activeBlobUrls = [];

  function revokeAllBlobUrls() {
    activeBlobUrls.forEach(function (url) {
      try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    });
    activeBlobUrls = [];
  }

  function base64ToBlob(b64, mime) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /** After cards are mounted to the DOM, build a blob URL per PDF and
   *  insert the actual <iframe>. Done post-mount because we need a
   *  stable target element for the URL revoke lifecycle. */
  function attachPdfIframes(items) {
    revokeAllBlobUrls();
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    itemsContainer.querySelectorAll('.report-item__pdf-mount').forEach(function (mount) {
      var item = byId[mount.dataset.pdfId];
      if (!item || !item.pdfBase64) return;
      var blob = base64ToBlob(item.pdfBase64, 'application/pdf');
      var url = URL.createObjectURL(blob);
      activeBlobUrls.push(url);
      var iframe = document.createElement('iframe');
      iframe.className = 'report-item__pdf';
      iframe.src = url;
      iframe.title = mount.dataset.pdfTitle || 'PDF preview';
      mount.replaceWith(iframe);
    });
  }

  function buildCard(item) {
    var div = document.createElement('div');
    div.className = 'report-item';
    div.setAttribute('data-id', item.id);
    div.setAttribute('draggable', 'true');
    div.innerHTML =
      '<div class="report-item__header">' +
        '<div class="report-item__drag-handle" title="Drag to reorder">' + DRAG_HANDLE_SVG + '</div>' +
        '<div class="report-item__info">' +
          '<span class="report-item__icon">' + escapeHtml(item.icon || '📄') + '</span>' +
          '<span class="report-item__name">' + escapeHtml(item.name) + '</span>' +
          '<span class="report-item__time">' + escapeHtml(formatTime(item.timestamp)) + '</span>' +
        '</div>' +
        '<button class="report-item__remove" data-id="' + escapeHtml(item.id) + '">Remove</button>' +
      '</div>' +
      '<div class="report-item__body">' + buildCardBody(item) + '</div>';
    return div;
  }

  /* ---- Drag & Drop reorder (HTML5 native) ---- */
  var dragSrcEl = null;

  function clearDropIndicators() {
    itemsContainer.querySelectorAll('.report-item--drag-over-top, .report-item--drag-over-bottom').forEach(function (el) {
      el.classList.remove('report-item--drag-over-top', 'report-item--drag-over-bottom');
    });
  }

  function findCardParent(el) {
    while (el && el !== itemsContainer) {
      if (el.classList && el.classList.contains('report-item')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('report-item--dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var target = findCardParent(e.target);
    if (!target || target === dragSrcEl) return;
    clearDropIndicators();
    var rect = target.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    target.classList.add(e.clientY < midY ? 'report-item--drag-over-top' : 'report-item--drag-over-bottom');
  }

  function handleDragLeave(e) {
    var target = findCardParent(e.target);
    if (target) target.classList.remove('report-item--drag-over-top', 'report-item--drag-over-bottom');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    var target = findCardParent(e.target);
    if (!target || !dragSrcEl || target === dragSrcEl) return;
    var rect = target.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      itemsContainer.insertBefore(dragSrcEl, target);
    } else {
      itemsContainer.insertBefore(dragSrcEl, target.nextSibling);
    }
    clearDropIndicators();
    persistOrder();
  }

  function handleDragEnd() {
    if (dragSrcEl) dragSrcEl.classList.remove('report-item--dragging');
    dragSrcEl = null;
    clearDropIndicators();
  }

  function persistOrder() {
    var ordered = [];
    itemsContainer.querySelectorAll('.report-item').forEach(function (el) {
      ordered.push(el.getAttribute('data-id'));
    });
    MSFG.Report.reorderItems(ordered);
  }

  function attachDragHandlers(card) {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
  }

  /* ---- Render ---- */
  function renderItems(items) {
    itemsContainer.innerHTML = '';

    if (!items.length) {
      emptyState.style.display = '';
      actionsBar.classList.add('u-hidden');
      countEl.textContent = '';
      return;
    }

    emptyState.style.display = 'none';
    actionsBar.classList.remove('u-hidden');
    countEl.textContent = '(' + items.length + ' item' + (items.length !== 1 ? 's' : '') + ')';

    items.forEach(function (item) {
      var card = buildCard(item);
      itemsContainer.appendChild(card);
      attachDragHandlers(card);
    });

    // Cards are now in the DOM — swap each .report-item__pdf-mount
    // placeholder for a real <iframe> with a fresh blob URL.
    attachPdfIframes(items);

    itemsContainer.querySelectorAll('.report-item__remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        MSFG.Report.removeItem(id).then(loadAndRender);
      });
    });
  }

  function loadAndRender() {
    MSFG.Report.getItems().then(renderItems);
  }

  /* ---- Action handlers ---- */
  var printBtn = document.getElementById('btnPrintReport');
  var pdfBtn = document.getElementById('btnPdfReport');
  var clearBtn = document.getElementById('btnClearReport');

  if (printBtn) {
    printBtn.addEventListener('click', function () { window.print(); });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (confirm('Remove all items from the session report?')) {
        MSFG.Report.clear().then(loadAndRender);
      }
    });
  }

  if (pdfBtn) {
    pdfBtn.addEventListener('click', function () {
      var origText = pdfBtn.textContent;
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Building…';
      MSFG.Report.getItems().then(function (items) {
        // Only items with an attached PDF can be merged. Legacy items
        // (data only) are skipped — surface a notice if all of them
        // are skipped.
        var pdfs = items.filter(function (it) { return !!it.pdfBase64; });
        if (!pdfs.length) {
          throw new Error('No items in the session have PDFs attached. Re-add them from the workspace.');
        }
        return MSFG.fetch(MSFG.apiUrl('/report/api/merge-pdfs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfs: pdfs.map(function (it) { return it.pdfBase64; }) })
        });
      }).then(function (resp) {
        if (!resp.ok) return resp.text().then(function (t) { throw new Error('Merge failed: ' + t.slice(0, 120)); });
        return resp.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'MSFG-Session-Report-' + new Date().toISOString().slice(0, 10) + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      }).catch(function (err) {
        alert(err.message || 'Could not export PDF.');
      }).finally(function () {
        pdfBtn.disabled = false;
        pdfBtn.textContent = origText;
      });
    });
  }

  loadAndRender();
})();
