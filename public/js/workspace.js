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
  const selectorSearch = document.getElementById('wsSelectorSearch');
  const toggleSelectorBtn = document.getElementById('wsToggleSelector');
  const collapseAllBtn = document.getElementById('wsCollapseAll');
  const clearAllBtn = document.getElementById('wsClearAll');

  let activePanels = [];
  let panelCounter = 0;

  function updateCount() {
    if (countEl) countEl.textContent = activePanels.length + ' active';
    if (emptyState) emptyState.style.display = activePanels.length ? 'none' : '';
  }

  /* ---- Selector drawer ---- */
  if (toggleSelectorBtn) {
    toggleSelectorBtn.addEventListener('click', function() {
      selectorEl.classList.toggle('u-hidden');
      if (!selectorEl.classList.contains('u-hidden') && selectorSearch) {
        selectorSearch.value = '';
        selectorSearch.focus();
        filterSelector('');
      }
    });
  }

  if (selectorSearch) {
    selectorSearch.addEventListener('input', function() {
      filterSelector(this.value.toLowerCase().trim());
    });
  }

  function filterSelector(q) {
    const btns = document.querySelectorAll('.workspace__selector-btn');
    btns.forEach(function(btn) {
      const name = btn.dataset.name || '';
      btn.classList.toggle('hidden', q && name.indexOf(q) === -1);
    });
  }

  /* ---- Add document panel ----
     Selector buttons are added in two waves:
       1. Server-side renders documents + local templates from res.locals.
       2. After load, fetchDashboardDocs() injects investor-grouped buttons
          for editable PDFs uploaded via the dashboard's investor profile.
     Both waves use the same data-type/data-slug contract; click handler is
     bound once via event delegation on the selector grid. */
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
        type,
        {
          investorId: btn.dataset.investorId || '',
          docId: btn.dataset.docId || ''
        }
      );
    });
  }

  function panelIframeSrc(slug, type, ctx) {
    if (type === 'dashboard-doc' && ctx && ctx.investorId && ctx.docId) {
      return MSFG.appUrl('/dashboard-docs/' + encodeURIComponent(ctx.investorId) + '/' + encodeURIComponent(ctx.docId) + '/fill') + '?embed=1';
    }
    if (type === 'template') {
      return MSFG.appUrl('/templates/' + slug + '/fill') + '?embed=1';
    }
    return MSFG.appUrl('/documents/' + slug) + '?embed=1';
  }

  function addPanel(slug, name, icon, type, ctx) {
    panelCounter++;
    const panelId = 'ws-panel-' + panelCounter;
    const panelType = type || 'document';
    ctx = ctx || {};

    const panel = document.createElement('div');
    panel.className = 'ws-panel';
    panel.id = panelId;
    panel.dataset.slug = slug;
    panel.dataset.type = panelType;
    if (ctx.investorId) panel.dataset.investorId = ctx.investorId;
    if (ctx.docId) panel.dataset.docId = ctx.docId;

    panel.innerHTML =
      '<div class="ws-panel__header">' +
        '<span class="ws-panel__icon">' + icon + '</span>' +
        '<h3 class="ws-panel__title">' + MSFG.escHtml(name) + '</h3>' +
        '<div class="ws-panel__actions">' +
          '<button class="ws-panel__btn ws-panel__btn--collapse" title="Collapse">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</button>' +
          '<button class="ws-panel__btn ws-panel__btn--remove" title="Remove">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ws-panel__body">' +
        '<iframe class="ws-panel__iframe" src="' + panelIframeSrc(slug, panelType, ctx) + '" title="' + MSFG.escHtml(name) + '"></iframe>' +
      '</div>';

    panels.appendChild(panel);
    activePanels.push(panelId);
    updateCount();

    // Collapse/expand
    const collapseBtn = panel.querySelector('.ws-panel__btn--collapse');
    collapseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const body = panel.querySelector('.ws-panel__body');
      body.classList.toggle('collapsed');
    });

    // Header click to collapse
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
    });

    // Close selector after adding
    if (selectorEl) selectorEl.classList.add('u-hidden');
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
    });
  }

  updateCount();

  /* ---- Fetch dashboard-sourced investor docs ----
     Async hydration of the selector grid. We POST nothing — just a GET
     through msfg-docs which forwards the user's Cognito token to the
     dashboard backend. Failures degrade silently to "no investor docs"
     so the workspace still works without dashboard access. */
  const DOC_TYPE_LABELS = {
    'form-4506c': 'Form 4506-C',
    'form-ssa89': 'Form SSA-89',
    'template':   'Template',
  };
  const DOC_TYPE_ICONS = {
    'form-4506c': '📋',
    'form-ssa89': '🆔',
    'template':   '📄',
  };

  function appendDashboardGroups(buckets) {
    if (!selectorGrid || !buckets || !buckets.length) return;

    // Sort investors alphabetically; render a divider header so the
    // dashboard section is visually distinct from local templates above.
    const sorted = buckets.slice().sort(function(a, b) {
      return String(a.investorName || '').localeCompare(String(b.investorName || ''));
    });

    sorted.forEach(function(bucket) {
      const groupEl = document.createElement('div');
      groupEl.className = 'workspace__selector-group';
      groupEl.dataset.cat = 'dashboard';
      groupEl.setAttribute('data-investor-id', bucket.investorId);

      const labelEl = document.createElement('div');
      labelEl.className = 'workspace__selector-label';
      labelEl.setAttribute('data-border-color', '#1565c0');
      labelEl.textContent = bucket.investorName || ('Investor #' + bucket.investorId);
      groupEl.appendChild(labelEl);

      bucket.docs.forEach(function(doc) {
        const btn = document.createElement('button');
        btn.className = 'workspace__selector-btn';
        btn.dataset.type = 'dashboard-doc';
        btn.dataset.investorId = String(bucket.investorId);
        btn.dataset.docId = String(doc.docId);
        // Slug field is unused for dashboard docs but kept for the data
        // attribute the picker search reads.
        btn.dataset.slug = 'dashboard-' + bucket.investorId + '-' + doc.docId;
        const searchable = (doc.fileName || '').toLowerCase()
          + ' ' + String(bucket.investorName || '').toLowerCase()
          + ' ' + (DOC_TYPE_LABELS[doc.docType] || doc.docType || '').toLowerCase();
        btn.dataset.name = searchable;

        const iconEl = document.createElement('span');
        iconEl.className = 'workspace__selector-icon';
        iconEl.textContent = DOC_TYPE_ICONS[doc.docType] || '📄';
        btn.appendChild(iconEl);

        const nameEl = document.createElement('span');
        nameEl.className = 'workspace__selector-name';
        nameEl.textContent = doc.fileName || ('Document #' + doc.docId);
        btn.appendChild(nameEl);

        groupEl.appendChild(btn);
      });

      selectorGrid.appendChild(groupEl);
    });
  }

  MSFG.fetch(MSFG.apiUrl('/dashboard-docs/list'))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (!data || !data.success) return;
      appendDashboardGroups(data.investors || []);
    })
    .catch(function(err) {
      // Non-fatal — workspace still works without dashboard docs.
      console.warn('Dashboard docs unavailable:', err);
    });
})();
