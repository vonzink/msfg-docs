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
  const GLOBAL_KEY = STORAGE_KEY + ':__global__';

  /** Compose the localStorage key for a given doc slug. Per-doc
   *  settings win; fall back to the shared global default. */
  function keyFor(slug) {
    return slug ? STORAGE_KEY + ':' + slug : GLOBAL_KEY;
  }

  /** Find the per-doc slug from the settings panel on the current
   *  page. Letters without a slug share the global bucket. */
  function currentSlug() {
    const root = document.querySelector('.letter-settings')
      || document.querySelector('.letter-style-picker');
    return (root && root.dataset.docSlug) || '';
  }

  const DEFAULTS = {
    templateStyle: 'A',         // 'A' Evergreen | 'B' Ledger | 'C' Plain
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

  // Each A/B/C template style maps to a full appearance combo chosen to
  // mirror its PDF renderer (lib/pdf/borrowerLetter{,B,C}.js): A Evergreen
  // serif, B Compact Ledger (teal, dense, mono headers), C Plain business
  // letter (monochrome serif). On pages without the granular gear panel
  // this is what drives the live preview look.
  const STYLE_THEMES = {
    A: { fontFamily: 'times',     fontSize: 11, accent: '#1d4d3e', tableStyle: 'dotted', titleAlign: 'center', margin: 'normal', headerBand: false, footerBand: false, leftRail: false, justify: false },
    B: { fontFamily: 'helvetica', fontSize: 10, accent: '#0f8a8e', tableStyle: 'thin',   titleAlign: 'left',   margin: 'narrow', headerBand: false, footerBand: false, leftRail: true,  justify: false },
    C: { fontFamily: 'times',     fontSize: 11, accent: '#1d1d1f', tableStyle: 'thin',   titleAlign: 'left',   margin: 'wide',   headerBand: false, footerBand: false, leftRail: false, justify: false },
  };

  function normalizeStyle(style) {
    const s = String(style == null ? '' : style).trim().toUpperCase();
    return (s === 'B' || s === 'C') ? s : 'A';
  }

  // Named presets — map each to a full settings object. The "Apply
  // preset" buttons in the panel just copy these in.
  const PRESETS = {
    classic: { fontFamily: 'times', fontSize: 11, accent: '#2d6a4f', tableStyle: 'dotted',   titleAlign: 'center', margin: 'normal', headerBand: false, footerBand: false, leftRail: false, justify: true },
    modern:  { fontFamily: 'helvetica', fontSize: 11, accent: '#2d6a4f', tableStyle: 'striped',   titleAlign: 'left',   margin: 'normal', headerBand: false, footerBand: false, leftRail: true,  justify: false },
    branded: { fontFamily: 'helvetica', fontSize: 11, accent: '#2d6a4f', tableStyle: 'accentKey', titleAlign: 'left',   margin: 'normal', headerBand: true,  footerBand: true,  leftRail: false, justify: false },
    compact: { fontFamily: 'helvetica', fontSize: 9,  accent: '#2d6a4f', tableStyle: 'thin',      titleAlign: 'left',   margin: 'narrow', headerBand: false, footerBand: false, leftRail: false, justify: false },
  };

  const MARGIN_PX = { narrow: 18, normal: 32, wide: 48 };

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) || null;
    } catch (_e) { return null; }
  }

  /** Resolve settings for the current page: per-doc override →
   *  global default → hardcoded DEFAULTS. Accepts an optional slug
   *  so PDF-download code can request a specific doc's settings. */
  function readSettings(slug) {
    const key = typeof slug === 'undefined' ? keyFor(currentSlug()) : keyFor(slug);
    const perDoc = readJson(key);
    const global = (key === GLOBAL_KEY) ? null : readJson(GLOBAL_KEY);
    return Object.assign({}, DEFAULTS, global || {}, perDoc || {});
  }

  function writeSettings(s, opts) {
    const applyAll = !!(opts && opts.applyToAll);
    const slug = currentSlug();
    try {
      localStorage.setItem(keyFor(slug), JSON.stringify(s));
      if (applyAll) localStorage.setItem(GLOBAL_KEY, JSON.stringify(s));
    } catch (_e) { /* storage may be blocked */ }
  }

  /** Apply the settings object to every .letter-preview on the page.
   *  Scalars become CSS custom properties; booleans become
   *  letter-preview--* state classes. */
  function applySettings(s) {
    const style = normalizeStyle(s.templateStyle);
    // The granular gear panel (pre-approval only) keeps full control of the
    // look; everywhere else the chosen A/B/C template theme drives it so the
    // preview mirrors the PDF the picker will produce.
    const hasPanel = !!document.querySelector('.letter-settings');
    const eff = hasPanel ? s : Object.assign({}, s, STYLE_THEMES[style]);

    document.querySelectorAll('.letter-preview').forEach(function (el) {
      el.style.setProperty('--lp-font', eff.fontFamily === 'helvetica'
        ? '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
        : 'Georgia, "Times New Roman", serif');
      el.style.setProperty('--lp-size', eff.fontSize + 'pt');
      el.style.setProperty('--lp-accent', eff.accent);
      el.style.setProperty('--lp-margin', (MARGIN_PX[eff.margin] || MARGIN_PX.normal) + 'px');
      el.style.setProperty('--lp-title-align', eff.titleAlign);
      el.style.setProperty('--lp-text-align', eff.justify ? 'justify' : 'left');

      ['plain', 'dotted', 'striped', 'accentKey', 'thin'].forEach(function (t) {
        el.classList.toggle('letter-preview--table-' + t, eff.tableStyle === t);
      });
      el.classList.toggle('letter-preview--header-band', !!eff.headerBand);
      el.classList.toggle('letter-preview--footer-band', !!eff.footerBand);
      el.classList.toggle('letter-preview--left-rail', !!eff.leftRail);

      ['A', 'B', 'C'].forEach(function (k) {
        el.classList.toggle('letter-preview--style-' + k.toLowerCase(), style === k);
      });
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

  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  document.addEventListener('DOMContentLoaded', function () {
    // Always apply saved settings to any .letter-preview on the page —
    // even pages without the settings panel (e.g. a future consumer).
    applySettings(readSettings());

    // A/B/C template-style picker (borrower-letter pages). Persists the
    // choice per-doc and live-restyles the preview; each doc's Download
    // reads the same setting so the PDF matches what the user picked.
    const picker = document.querySelector('.letter-style-picker');
    if (picker) {
      const opts = Array.prototype.slice.call(picker.querySelectorAll('[data-style]'));
      const syncPicker = function (style) {
        opts.forEach(function (b) {
          const on = normalizeStyle(b.dataset.style) === style;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      };
      syncPicker(normalizeStyle(readSettings().templateStyle));
      opts.forEach(function (b) {
        b.addEventListener('click', function () {
          const style = normalizeStyle(b.dataset.style);
          const st = readSettings();
          st.templateStyle = style;
          writeSettings(st);
          applySettings(st);
          syncPicker(style);
        });
      });
    }

    const root = document.querySelector('.letter-settings');
    if (!root) return;

    const panel = root.querySelector('.letter-settings__panel');
    const toggle = root.querySelector('.letter-settings__gear');
    const resetBtn = root.querySelector('.letter-settings__reset');
    const presetBtns = root.querySelectorAll('.letter-settings__preset');
    const accentText = root.querySelector('input[type="text"][data-setting="accent"]');
    const accentPicker = root.querySelector('input[type="color"][data-setting="accent"]');
    const accentError = root.querySelector('#lsAccentError');
    const applyAllCb = root.querySelector('#lsApplyAll');

    /* ---- Open / close the popover ---- */
    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(panel.hidden);
    });
    // Click-outside closes — but ignore clicks INSIDE the panel.
    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (root.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });

    /* ---- Form → state → preview → storage pipeline ---- */
    let state = readSettings();
    syncFormToSettings(root, state);

    function setAccentError(show) {
      if (!accentError) return;
      accentError.hidden = !show;
      if (accentText) accentText.classList.toggle('is-invalid', !!show);
    }

    function persist() {
      writeSettings(state, { applyToAll: !!(applyAllCb && applyAllCb.checked) });
    }

    root.querySelectorAll('[data-setting]').forEach(function (input) {
      input.addEventListener('input', function () {
        // Accent text field — validate hex. Keep stale values on-screen
        // so the user can finish typing, but only commit when valid.
        if (input === accentText) {
          const hex = String(input.value || '').trim();
          if (!HEX_RE.test(hex)) {
            setAccentError(true);
            return;
          }
          setAccentError(false);
          if (accentPicker) accentPicker.value = hex;
        }
        // Color picker → mirror the hex text input
        if (input === accentPicker && accentText) {
          accentText.value = input.value;
          setAccentError(false);
        }
        state = readFormIntoSettings(root, state);
        applySettings(state);
        persist();
      });
      input.addEventListener('change', function () {
        state = readFormIntoSettings(root, state);
        applySettings(state);
        persist();
      });
    });

    if (applyAllCb) {
      applyAllCb.addEventListener('change', function () {
        // Flipping it ON should immediately promote current state to
        // the shared global default.
        persist();
      });
    }

    /* ---- Presets — copy full combo into state + form + storage ---- */
    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const name = btn.dataset.preset;
        if (!PRESETS[name]) return;
        state = Object.assign({}, PRESETS[name]);
        syncFormToSettings(root, state);
        applySettings(state);
        setAccentError(false);
        persist();
      });
    });

    /* ---- Reset to defaults ---- */
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state = Object.assign({}, DEFAULTS);
        syncFormToSettings(root, state);
        applySettings(state);
        setAccentError(false);
        persist();
      });
    }
  });
})();
