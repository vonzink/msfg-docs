/* =====================================================
   Letter appearance — per-user settings
   Replaces the earlier 4-preset picker. Reads + writes a full
   settings object to localStorage (shared across borrower-letter
   docs) and applies it live to the .letter-preview via CSS custom
   properties + state classes. The same settings object is read by
   each doc's Download client code and sent in the PDF payload so
   backend output matches the preview.
   ===================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'msfg-docs.letter-settings.v1';

  const DEFAULTS = {
    fontFamily: 'times',        // 'times' | 'helvetica'
    fontSize: 11,               // 9 | 10 | 11 | 12 | 13
    accent: '#2d6a4f',
    tableStyle: 'dotted',       // plain | dotted | striped | accentKey | thin
    titleAlign: 'center',
    margin: 'normal',           // narrow | normal | wide
    headerBand: false,
    footerBand: false,
    leftRail: false,
    justify: true,
  };

  // Named presets — map each to a full settings object. The "Apply
  // preset" buttons in the panel just copy these in.
  const PRESETS = {
    classic: { fontFamily: 'times', fontSize: 11, accent: '#2d6a4f', tableStyle: 'dotted',   titleAlign: 'center', margin: 'normal', headerBand: false, footerBand: false, leftRail: false, justify: true },
    modern:  { fontFamily: 'helvetica', fontSize: 11, accent: '#2d6a4f', tableStyle: 'striped',   titleAlign: 'left',   margin: 'normal', headerBand: false, footerBand: false, leftRail: true,  justify: false },
    branded: { fontFamily: 'helvetica', fontSize: 11, accent: '#2d6a4f', tableStyle: 'accentKey', titleAlign: 'left',   margin: 'normal', headerBand: true,  footerBand: true,  leftRail: false, justify: false },
    compact: { fontFamily: 'helvetica', fontSize: 9,  accent: '#2d6a4f', tableStyle: 'thin',      titleAlign: 'left',   margin: 'narrow', headerBand: false, footerBand: false, leftRail: false, justify: false },
  };

  const MARGIN_PX = { narrow: 18, normal: 32, wide: 48 };

  function readSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, parsed || {});
    } catch (_e) { return Object.assign({}, DEFAULTS); }
  }

  function writeSettings(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
    catch (_e) { /* storage may be blocked */ }
  }

  /** Apply the settings object to every .letter-preview on the page.
   *  Scalars become CSS custom properties; booleans become
   *  letter-preview--* state classes. */
  function applySettings(s) {
    document.querySelectorAll('.letter-preview').forEach(function (el) {
      el.style.setProperty('--lp-font', s.fontFamily === 'helvetica'
        ? '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
        : 'Georgia, "Times New Roman", serif');
      el.style.setProperty('--lp-size', s.fontSize + 'pt');
      el.style.setProperty('--lp-accent', s.accent);
      el.style.setProperty('--lp-margin', (MARGIN_PX[s.margin] || MARGIN_PX.normal) + 'px');
      el.style.setProperty('--lp-title-align', s.titleAlign);
      el.style.setProperty('--lp-text-align', s.justify ? 'justify' : 'left');

      ['plain', 'dotted', 'striped', 'accentKey', 'thin'].forEach(function (t) {
        el.classList.toggle('letter-preview--table-' + t, s.tableStyle === t);
      });
      el.classList.toggle('letter-preview--header-band', !!s.headerBand);
      el.classList.toggle('letter-preview--footer-band', !!s.footerBand);
      el.classList.toggle('letter-preview--left-rail', !!s.leftRail);
    });
  }

  /** Public getter — each doc's Download client reads this to include
   *  letterSettings in its PDF payload so the backend produces output
   *  that matches the live preview. */
  function currentSettings() { return readSettings(); }
  window.MSFG = window.MSFG || {};
  window.MSFG.LetterSettings = {
    read: currentSettings,
    apply: applySettings,
    DEFAULTS: DEFAULTS,
  };

  /* ---- Panel wiring ---- */
  function syncFormToSettings(panelRoot, s) {
    panelRoot.querySelectorAll('[data-setting]').forEach(function (input) {
      const key = input.dataset.setting;
      if (!Object.prototype.hasOwnProperty.call(s, key)) return;
      const v = s[key];
      if (input.type === 'checkbox') input.checked = !!v;
      else if (input.tagName === 'SELECT') input.value = String(v);
      else input.value = String(v);
    });
  }

  function readFormIntoSettings(panelRoot, s) {
    panelRoot.querySelectorAll('[data-setting]').forEach(function (input) {
      const key = input.dataset.setting;
      if (input.type === 'checkbox') {
        s[key] = input.checked;
      } else if (input.type === 'color' || input.tagName === 'SELECT' || input.type === 'text') {
        let v = input.value;
        if (key === 'fontSize') v = parseInt(v, 10) || DEFAULTS.fontSize;
        s[key] = v;
      }
    });
    return s;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Always apply saved settings to any .letter-preview on the page —
    // even pages without the settings panel (e.g. a future consumer).
    applySettings(readSettings());

    const root = document.querySelector('.letter-settings');
    if (!root) return;

    const panel = root.querySelector('.letter-settings__panel');
    const toggle = root.querySelector('.letter-settings__gear');
    const resetBtn = root.querySelector('.letter-settings__reset');
    const presetBtns = root.querySelectorAll('.letter-settings__preset');

    // Open/close the panel
    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () {
      setOpen(panel.hidden);
    });

    // Populate form from current settings
    let state = readSettings();
    syncFormToSettings(root, state);

    // Keep color picker + hex text input in sync (both have
    // data-setting="accent"). Any change re-applies the settings.
    root.querySelectorAll('[data-setting]').forEach(function (input) {
      input.addEventListener('input', function () {
        // Color text input → validate + broadcast to the matching color
        if (input.type === 'text' && input.dataset.setting === 'accent') {
          const hex = String(input.value || '').trim();
          if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            const picker = root.querySelector('input[type="color"][data-setting="accent"]');
            if (picker) picker.value = hex;
          } else {
            return; // invalid hex — don't persist until valid
          }
        }
        if (input.type === 'color' && input.dataset.setting === 'accent') {
          const txt = root.querySelector('input[type="text"][data-setting="accent"]');
          if (txt) txt.value = input.value;
        }
        state = readFormIntoSettings(root, state);
        applySettings(state);
        writeSettings(state);
      });
      input.addEventListener('change', function () {
        state = readFormIntoSettings(root, state);
        applySettings(state);
        writeSettings(state);
      });
    });

    // Presets — copy full preset combo into state + form + storage.
    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const name = btn.dataset.preset;
        if (!PRESETS[name]) return;
        state = Object.assign({}, PRESETS[name]);
        syncFormToSettings(root, state);
        applySettings(state);
        writeSettings(state);
      });
    });

    // Reset to defaults
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state = Object.assign({}, DEFAULTS);
        syncFormToSettings(root, state);
        applySettings(state);
        writeSettings(state);
      });
    }
  });
})();
