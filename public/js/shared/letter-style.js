/* =====================================================
   Letter style switcher
   - Wires the partials/letter-style-picker.ejs picker into the
     .letter-preview class list so the chosen visual style applies
     instantly.
   - Persists the picked style per-doc-slug to localStorage so the
     LO's preferred look sticks across sessions.
   - Loaded by the layout on every page; safely no-ops on pages
     without a picker.
   ===================================================== */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'msfg-docs.letter-style.';
  const VALID_STYLES = ['classic', 'modern', 'branded', 'compact'];
  const DEFAULT_STYLE = 'classic';

  function storageKey(slug) {
    return STORAGE_PREFIX + (slug || 'unknown');
  }

  function readSavedStyle(slug) {
    try {
      const v = localStorage.getItem(storageKey(slug));
      return VALID_STYLES.indexOf(v) === -1 ? DEFAULT_STYLE : v;
    } catch (_e) { return DEFAULT_STYLE; }
  }

  function saveStyle(slug, style) {
    try { localStorage.setItem(storageKey(slug), style); }
    catch (_e) { /* storage may be blocked */ }
  }

  function applyStyle(style) {
    const valid = VALID_STYLES.indexOf(style) === -1 ? DEFAULT_STYLE : style;
    document.querySelectorAll('.letter-preview').forEach(function (el) {
      VALID_STYLES.forEach(function (s) {
        el.classList.remove('letter-preview--style-' + s);
      });
      el.classList.add('letter-preview--style-' + valid);
    });
  }

  function syncChips(picker, style) {
    picker.querySelectorAll('.letter-style-picker__chip').forEach(function (chip) {
      const isOn = chip.dataset.style === style;
      chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const picker = document.querySelector('.letter-style-picker');
    if (!picker) return;
    const sel = picker.querySelector('#letterStyleSelect');
    if (!sel) return;

    const slug = picker.dataset.docSlug || (window.__docSlug || '');
    const initial = readSavedStyle(slug);
    sel.value = initial;
    applyStyle(initial);
    syncChips(picker, initial);

    sel.addEventListener('change', function () {
      const v = sel.value || DEFAULT_STYLE;
      applyStyle(v);
      syncChips(picker, v);
      saveStyle(slug, v);
    });

    // Chip clicks mirror the select for a quicker scan.
    picker.querySelectorAll('.letter-style-picker__chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        sel.value = chip.dataset.style;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });
})();
