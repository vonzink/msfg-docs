/* =====================================================
   MSFG.LetterSheet — wraps the editable letter preview in a
   branded "paper" frame (logo letterhead + accent rule + footer
   band) so what the user sees on screen is exactly what the
   Download/Print/Email PDF contains.

   - Reads logo + company from <meta> tags injected by the layout.
   - Mirrors the A/B/C theme (--lp-accent, --lp-margin, style class)
     that letter-style.js writes onto #letterPreview up onto the
     .letter-sheet so the head + foot match the body.
   - Exposes getSheetHtml() for the WYSIWYG PDF route.

   #letterPreview stays the only contenteditable region (the head
   and foot are chrome, not editable).
   ===================================================== */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});

  function meta(name) {
    const m = document.querySelector('meta[name="' + name + '"]');
    return m ? (m.getAttribute('content') || '').trim() : '';
  }

  function buildFrame(preview) {
    const existing = preview.closest('.letter-sheet');
    if (existing) return existing;

    const company = meta('msfg-company') || 'Mountain State Financial Group';
    const logoUrl = meta('msfg-logo');
    const footer = meta('msfg-footer') || (company + '  |  msfginfo.com');

    const sheet = document.createElement('div');
    sheet.className = 'letter-sheet';

    const head = document.createElement('div');
    head.className = 'letter-sheet__head';
    head.innerHTML = logoUrl
      ? '<div class="letter-sheet__logo"><img src="' + logoUrl + '" alt="' + company + '"></div>'
      : '<div class="letter-sheet__wordmark">' + company + '</div>';

    const foot = document.createElement('div');
    foot.className = 'letter-sheet__foot';
    foot.textContent = footer;

    // Insert the sheet in the preview's place, then move the preview
    // inside it as the body (between head and foot).
    preview.parentNode.insertBefore(sheet, preview);
    sheet.appendChild(head);
    sheet.appendChild(preview);
    preview.classList.add('letter-sheet__body');
    sheet.appendChild(foot);
    return sheet;
  }

  // Copy the picker's theme vars/classes from the preview body up to the
  // sheet so the letterhead rule + footer band use the same accent, margin,
  // and left-rail treatment as the chosen A/B/C style.
  function syncTheme(preview, sheet) {
    const cs = getComputedStyle(preview);
    ['--lp-accent', '--lp-margin'].forEach(function (v) {
      const val = cs.getPropertyValue(v).trim();
      if (val) sheet.style.setProperty(v, val);
    });
    ['a', 'b', 'c'].forEach(function (k) {
      sheet.classList.toggle('letter-sheet--style-' + k, preview.classList.contains('letter-preview--style-' + k));
    });
    sheet.classList.toggle('letter-sheet--left-rail', preview.classList.contains('letter-preview--left-rail'));
  }

  function currentStyle(preview) {
    const m = (preview.className || '').match(/letter-preview--style-([abc])/);
    return m ? m[1].toUpperCase() : 'A';
  }

  function init() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;
    const sheet = buildFrame(preview);
    syncTheme(preview, sheet);

    // Keep the frame in sync whenever the picker re-themes the body.
    try {
      const obs = new MutationObserver(function () { syncTheme(preview, sheet); });
      obs.observe(preview, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (_e) { /* MutationObserver always present in target browsers */ }

    MSFG.LetterSheet = {
      sheetEl: sheet,
      getSheetHtml: function () { syncTheme(preview, sheet); return sheet.outerHTML; },
      getStyle: function () { return currentStyle(preview); }
    };
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
