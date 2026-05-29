/* =====================================================
   MSFG.LetterDoc — shared scaffolding for borrower-letter docs
   -----------------------------------------------------
   Every letter doc (address-lox, generic-lox, gift-letter,
   credit-inquiry, pre-approval) wires the same things: a live
   contenteditable preview, a "Download PDF" button that POSTs the form
   payload to /api/pdf/{slug}, Add-to-Session capture, email/report
   registration, and a MISMO autofill listener. This module owns all of
   it; each doc supplies only its doc-specific generate(), collectPayload(),
   getEmailData(), and (optionally) applyMismo().

   Preview-dirty ownership: this module tracks whether the user has
   hand-edited the preview. While dirty, regenerate() is a no-op so field
   edits don't clobber manual changes; Reset clears the flag and forces a
   rebuild. (The separate preview-dirty.js owns only the badge/confirm UX.)
   Because of this, each doc's generate() is now a PURE renderer — it must
   NOT self-gate on a dirty flag; LetterDoc decides when to call it.

   init(cfg) returns { regenerate, download } so docs with dynamic content
   (e.g. address-lox's repeating rows) can request a gated rebuild.
   ===================================================== */
(function () {
  'use strict';

  const MSFG = window.MSFG || (window.MSFG = {});

  function payloadFetch(slug, collectPayload) {
    return MSFG.fetch(MSFG.apiUrl('/api/pdf/' + slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectPayload())
    });
  }

  function init(cfg) {
    const slug = cfg.slug;
    const generate = cfg.generate || function () {};
    let dirty = false;

    function regenerate() { if (!dirty) generate(); }

    // filename may be a string or a function evaluated at download time
    // (e.g. credit-inquiry names the file after the loan number).
    function resolveFilename() {
      return typeof cfg.filename === 'function' ? cfg.filename() : cfg.filename;
    }

    async function download(btn) {
      if (btn) { btn.disabled = true; btn.dataset._lbl = btn.dataset._lbl || btn.textContent; btn.textContent = 'Building PDF…'; }
      try {
        const resp = await payloadFetch(slug, cfg.collectPayload);
        if (!resp.ok) throw new Error('PDF generation failed');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = resolveFilename();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      } catch (e) {
        console.error(e);
        alert(e.message || 'Could not generate PDF.');
      } finally {
        if (btn) { btn.disabled = false; if (btn.dataset._lbl) btn.textContent = btn.dataset._lbl; }
      }
    }

    document.addEventListener('DOMContentLoaded', function () {
      // Default the letter date to today when the field is empty.
      if (cfg.dateFieldId && !MSFG.val(cfg.dateFieldId)) {
        MSFG.setVal(cfg.dateFieldId, MSFG.formatDateLong());
      }

      // Download trigger — either a single button id or a CSS selector
      // (some docs put the action on a [data-action] button in the action bar).
      const dlBtn = cfg.downloadBtnId && document.getElementById(cfg.downloadBtnId);
      if (dlBtn) dlBtn.addEventListener('click', function () { download(dlBtn); });
      if (cfg.downloadSelector) {
        document.querySelectorAll(cfg.downloadSelector).forEach(function (b) {
          b.addEventListener('click', function () { download(b); });
        });
      }

      // Form fields that should rebuild the preview (gated by dirty).
      (cfg.previewFields || []).forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', regenerate);
        el.addEventListener('change', regenerate);
      });

      // Manual preview edits flip the dirty flag; Reset clears it and forces
      // a rebuild from the fields.
      const preview = document.getElementById(cfg.previewId || 'letterPreview');
      if (preview) preview.addEventListener('input', function () { dirty = true; });
      const reset = cfg.resetBtnId && document.getElementById(cfg.resetBtnId);
      if (reset) reset.addEventListener('click', function (e) {
        e.preventDefault();
        dirty = false;
        generate();
      });

      // Initial render.
      generate();

      // MISMO autofill from the parent dashboard.
      if (typeof cfg.applyMismo === 'function') {
        window.addEventListener('message', function (e) {
          if (e.origin !== window.location.origin) return;
          if (!e.data || e.data.type !== 'MSFG_MISMO') return;
          cfg.applyMismo(e.data.payload && e.data.payload.parsed);
          regenerate();
        });
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
          }
        } catch (_e) { /* ignore */ }
      }

      // Email / report extractor + Add-to-Session capture.
      if (typeof cfg.getEmailData === 'function') {
        if (MSFG.ReportTemplates) MSFG.ReportTemplates.registerExtractor(slug, cfg.getEmailData);
        if (MSFG.DocActions) {
          MSFG.DocActions.register(cfg.getEmailData);
          if (typeof MSFG.DocActions.registerCapture === 'function') {
            MSFG.DocActions.registerCapture(function () {
              return payloadFetch(slug, cfg.collectPayload).then(function (resp) {
                if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
                return resp.arrayBuffer();
              }).then(function (buf) {
                return {
                  pdfBytes: new Uint8Array(buf),
                  name: cfg.name,
                  icon: cfg.icon,
                  slug: slug,
                  data: cfg.getEmailData(),
                  filename: resolveFilename()
                };
              });
            });
          }
        }
      }

      // Doc-specific post-wire setup (seed rows, extra listeners, etc.).
      if (typeof cfg.onReady === 'function') cfg.onReady({ regenerate: regenerate });
    });

    return { regenerate: regenerate, download: download };
  }

  MSFG.LetterDoc = { init: init };
})();
