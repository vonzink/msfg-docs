/* =====================================================
   MSFG Document Creator — Workspace
   Multi-document panel management
   ===================================================== */
(function() {
  'use strict';

  const panels = document.getElementById('wsPanels');
  const emptyState = document.getElementById('wsEmpty');
  const countEl = document.getElementById('wsCount');
  const selectorEl = document.getElementById('wsSelector');
  const toggleSelectorBtn = document.getElementById('wsToggleSelector');
  const collapseAllBtn = document.getElementById('wsCollapseAll');
  const clearAllBtn = document.getElementById('wsClearAll');

  let activePanels = [];
  let panelCounter = 0;
  const DEFAULT_ZOOM = 85;
  // Persisted across navigation so the workspace state survives
  // navigating to /report (Session) and back. Cleared via "Clear All"
  // or when the browser session ends.
  const STORAGE_KEY = 'msfg-docs-workspace-panels-v1';

  function updateCount() {
    if (countEl) countEl.textContent = activePanels.length + ' active';
    if (emptyState) emptyState.style.display = activePanels.length ? 'none' : '';
  }

  /* ---- Panel state persistence ----
     Persists the list of open panels (by slug + type + name + icon)
     to sessionStorage so a workspace → /report → workspace round-trip
     restores the same documents. Form values inside each iframe are
     each iframe's responsibility — they re-read MISMO from sessionStorage
     on mount via mismo-embed's MSFG_MISMO_REQUEST handshake. */

  function snapshotPanelState() {
    return Array.from(panels.querySelectorAll('.ws-panel')).map(function(p) {
      const titleEl = p.querySelector('.ws-panel__title');
      const iconEl = p.querySelector('.ws-panel__icon');
      const labelEl = p.querySelector('.ws-panel__zoom-label');
      return {
        slug: p.dataset.slug || '',
        type: p.dataset.type || 'document',
        name: titleEl ? titleEl.textContent.trim() : '',
        icon: iconEl ? iconEl.textContent.trim() : '',
        zoom: labelEl ? parseInt(labelEl.textContent, 10) || DEFAULT_ZOOM : DEFAULT_ZOOM,
        collapsed: !!p.querySelector('.ws-panel__body.collapsed')
      };
    });
  }

  function persistPanelState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotPanelState()));
    } catch (_e) { /* storage may be blocked */ }
  }

  function loadPersistedPanels() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) { return []; }
  }

  /** Mark/unmark the matching selector button to show which docs are
   *  already open in the workspace. Visual cue matches msfg-calc. */
  function syncSelectorAddedState() {
    if (!selectorGrid) return;
    const open = new Set(snapshotPanelState().map(function(p) { return p.slug; }));
    selectorGrid.querySelectorAll('.workspace__selector-btn').forEach(function(btn) {
      btn.classList.toggle('workspace__selector-btn--added', open.has(btn.dataset.slug));
    });
  }

  /* ---- Selector drawer ---- */
  if (toggleSelectorBtn) {
    toggleSelectorBtn.addEventListener('click', function() {
      selectorEl.classList.toggle('u-hidden');
    });
  }

  /* ---- Add document panel ----
     Selector buttons are server-side rendered from res.locals (documents
     from config/documents.json + locally-uploaded templates). The click
     handler is bound via event delegation on the selector grid. */
  const selectorGrid = document.getElementById('wsSelectorGrid');
  if (selectorGrid) {
    selectorGrid.addEventListener('click', function(e) {
      const btn = e.target.closest('.workspace__selector-btn');
      if (!btn) return;
      const type = btn.dataset.type || 'document';
      addPanel(
        btn.dataset.slug,
        btn.querySelector('.workspace__selector-name').textContent.trim(),
        btn.querySelector('.workspace__selector-icon').textContent.trim(),
        type
      );
    });
  }

  function panelIframeSrc(slug, type) {
    if (type === 'template') {
      return MSFG.appUrl('/templates/' + slug + '/fill') + '?embed=1';
    }
    return MSFG.appUrl('/documents/' + slug) + '?embed=1';
  }

  function panelStandaloneHref(slug, type) {
    if (type === 'template') return MSFG.appUrl('/templates/' + slug + '/fill');
    return MSFG.appUrl('/documents/' + slug);
  }

  function addPanel(slug, name, icon, type) {
    panelCounter++;
    const panelId = 'ws-panel-' + panelCounter;
    const panelType = type || 'document';

    const panel = document.createElement('div');
    panel.className = 'ws-panel';
    panel.id = panelId;
    panel.dataset.slug = slug;
    panel.dataset.type = panelType;

    // Header markup ported from msfg-calc workspace.js so the chrome
    // matches across both apps: zoom slider + add-to-session +
    // open-standalone + collapse + close, in that order.
    panel.innerHTML =
      '<div class="ws-panel__header" data-slug="' + MSFG.escHtml(slug) + '">' +
        '<span class="ws-panel__icon">' + icon + '</span>' +
        '<h3 class="ws-panel__title">' + MSFG.escHtml(name) + '</h3>' +
        '<div class="ws-panel__zoom">' +
          '<svg class="ws-panel__zoom-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
            '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
          '</svg>' +
          '<input type="range" class="ws-panel__zoom-slider" min="50" max="100" value="' + DEFAULT_ZOOM + '" step="5" />' +
          '<span class="ws-panel__zoom-label">' + DEFAULT_ZOOM + '%</span>' +
        '</div>' +
        '<div class="ws-panel__actions">' +
          '<button class="ws-panel__btn ws-panel__btn--report" title="Add to Session Report">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>' +
          '</button>' +
          '<a href="' + panelStandaloneHref(slug, panelType) + '" target="_blank" class="ws-panel__standalone" title="Open standalone">↗</a>' +
          '<button class="ws-panel__btn ws-panel__btn--collapse" title="Collapse">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</button>' +
          '<button class="ws-panel__btn ws-panel__btn--remove" title="Remove">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ws-panel__body">' +
        '<iframe class="ws-panel__iframe" src="' + panelIframeSrc(slug, panelType) + '" title="' + MSFG.escHtml(name) + '"></iframe>' +
      '</div>';

    panels.appendChild(panel);
    activePanels.push(panelId);
    updateCount();
    persistPanelState();
    syncSelectorAddedState();

    let panelZoom = DEFAULT_ZOOM;

    // Stop zoom-slider clicks from bubbling to the header (which would
    // collapse the panel).
    const zoomContainer = panel.querySelector('.ws-panel__zoom');
    zoomContainer.addEventListener('click', function(e) { e.stopPropagation(); });

    const slider = panel.querySelector('.ws-panel__zoom-slider');
    const zoomLabel = panel.querySelector('.ws-panel__zoom-label');
    const iframe = panel.querySelector('.ws-panel__iframe');

    slider.addEventListener('input', function() {
      const val = parseInt(this.value, 10);
      zoomLabel.textContent = val + '%';
      panelZoom = val;
      MSFG.WS.applyZoomToIframe(iframe, val);
    });

    iframe.addEventListener('load', function() {
      MSFG.WS.applyZoomToIframe(iframe, panelZoom);
    });

    // Stop standalone-link clicks from bubbling to the header.
    panel.querySelector('.ws-panel__standalone').addEventListener('click', function(e) {
      e.stopPropagation();
    });

    // Add-to-Session-Report — calls into the iframe's MSFG.DocActions
    // capture function (each document/template registers one) to fetch
    // the freshly-filled PDF, then stores it via MSFG.Report.addItem.
    const reportBtn = panel.querySelector('.ws-panel__btn--report');
    reportBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      capturePanelToReport(panel, slug, name, icon, iframe, reportBtn);
    });

    // Collapse/expand
    const collapseBtn = panel.querySelector('.ws-panel__btn--collapse');
    collapseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const body = panel.querySelector('.ws-panel__body');
      body.classList.toggle('collapsed');
    });

    // Header click to collapse (excluding controls inside it — they
    // stopPropagation above)
    panel.querySelector('.ws-panel__header').addEventListener('click', function() {
      const body = panel.querySelector('.ws-panel__body');
      body.classList.toggle('collapsed');
    });

    // Remove
    panel.querySelector('.ws-panel__btn--remove').addEventListener('click', function(e) {
      e.stopPropagation();
      panel.remove();
      activePanels = activePanels.filter(function(id) { return id !== panelId; });
      updateCount();
      persistPanelState();
      syncSelectorAddedState();
    });

    // Persist any time the user adjusts zoom (so the restore on
    // navigate-back keeps the same scale).
    slider.addEventListener('change', persistPanelState);

    // Selector intentionally stays open so the user can pick multiple
    // documents in a row without re-opening the drawer each time.
    // Toggle button on the toolbar closes it manually.
  }

  /** Reach into the iframe's window for a registered capture function,
   *  invoke it to get the filled PDF + structured data, then save the
   *  result to the session report via MSFG.Report.addItem. The capture
   *  function is registered by each document's JS in
   *  MSFG.DocActions.registerCapture(asyncFn). */
  function capturePanelToReport(panel, slug, name, icon, iframe, reportBtn) {
    const originalHtml = reportBtn.innerHTML;
    reportBtn.disabled = true;
    reportBtn.style.opacity = '0.5';

    let iframeWin = null;
    try { iframeWin = iframe.contentWindow; } catch (_e) { /* cross-origin */ }
    const docActions = iframeWin && iframeWin.MSFG && iframeWin.MSFG.DocActions;
    const captureFn = docActions && (docActions.captureForReport || docActions.capture);

    if (!captureFn) {
      MSFG.WS.showToast('This document does not support Add to Session yet', 'error');
      restoreReportBtn();
      return;
    }

    Promise.resolve(captureFn()).then(function(captured) {
      if (!captured) throw new Error('Empty capture result');
      // captured: { pdfBytes (Uint8Array|ArrayBuffer), name?, icon?,
      //             slug?, data?, filename? }
      const bytes = captured.pdfBytes
        ? (captured.pdfBytes.buffer ? captured.pdfBytes : new Uint8Array(captured.pdfBytes))
        : null;
      const pdfBase64 = bytes ? uint8ToBase64(bytes) : null;

      return MSFG.Report.addItem({
        name: captured.name || name,
        icon: captured.icon || icon,
        slug: captured.slug || slug,
        data: captured.data || null,
        pdfBase64: pdfBase64,
        filename: captured.filename || (slug + '-filled.pdf')
      });
    }).then(function() {
      MSFG.WS.showToast('Added to Session Report');
      reportBtn.style.color = 'var(--brand-primary, #2d6a4f)';
      setTimeout(restoreReportBtn, 1500);
    }).catch(function(err) {
      console.error('[Workspace] capture failed:', err);
      MSFG.WS.showToast(err.message || 'Capture failed', 'error');
      restoreReportBtn();
    });

    function restoreReportBtn() {
      reportBtn.disabled = false;
      reportBtn.style.opacity = '';
      reportBtn.innerHTML = originalHtml;
    }
  }

  /** Encode a Uint8Array to base64 in chunks (avoids the call-stack
   *  blow-up that happens when pushing >100KB through String.fromCharCode
   *  in one shot). */
  function uint8ToBase64(u8) {
    var CHUNK = 0x8000;
    var parts = [];
    for (var i = 0; i < u8.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
    }
    return btoa(parts.join(''));
  }

  /* ---- Collapse all ---- */
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', function() {
      document.querySelectorAll('.ws-panel__body').forEach(function(body) {
        body.classList.add('collapsed');
      });
    });
  }

  /* ---- Clear all ---- */
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function() {
      document.querySelectorAll('.ws-panel').forEach(function(panel) {
        panel.remove();
      });
      activePanels = [];
      updateCount();
      persistPanelState();
      syncSelectorAddedState();
    });
  }

  updateCount();

  /* ---- Restore persisted panels on load ----
     Re-creates each panel from sessionStorage so the user's open docs
     survive navigation to /report and back. Restored before the user
     interacts so the workspace looks the same as they left it. */
  loadPersistedPanels().forEach(function(p) {
    if (!p || !p.slug) return;
    addPanel(p.slug, p.name || p.slug, p.icon || '📄', p.type || 'document');
    // Apply persisted zoom + collapsed state to the just-added panel.
    const last = panels.querySelector('.ws-panel:last-child');
    if (!last) return;
    if (typeof p.zoom === 'number' && p.zoom !== DEFAULT_ZOOM) {
      const slider = last.querySelector('.ws-panel__zoom-slider');
      const label = last.querySelector('.ws-panel__zoom-label');
      const iframe = last.querySelector('.ws-panel__iframe');
      if (slider) slider.value = String(p.zoom);
      if (label) label.textContent = p.zoom + '%';
      if (iframe) iframe.addEventListener('load', function once() {
        iframe.removeEventListener('load', once);
        MSFG.WS.applyZoomToIframe(iframe, p.zoom);
      });
    }
    if (p.collapsed) {
      const body = last.querySelector('.ws-panel__body');
      if (body) body.classList.add('collapsed');
    }
  });
  syncSelectorAddedState();
  // Dashboard-sourced investor docs no longer surface in the workspace
  // selector. Per-investor pre-filled PDFs are picked from inside the
  // existing 4506-C / SSA-89 documents (via /dashboard-docs/list?docType=...).
})();
