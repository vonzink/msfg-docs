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

  /* ---- Add document panel ---- */
  document.querySelectorAll('.workspace__selector-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      addPanel(btn.dataset.slug, btn.querySelector('.workspace__selector-name').textContent.trim(),
               btn.querySelector('.workspace__selector-icon').textContent.trim());
    });
  });

  function addPanel(slug, name, icon) {
    panelCounter++;
    const panelId = 'ws-panel-' + panelCounter;

    const panel = document.createElement('div');
    panel.className = 'ws-panel';
    panel.id = panelId;
    panel.dataset.slug = slug;

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
        '<iframe class="ws-panel__iframe" src="' + MSFG.appUrl('/documents/' + slug) + '?embed=1" title="' + MSFG.escHtml(name) + '"></iframe>' +
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
})();
