/* =====================================================
   Preview dirty indicator + Reset confirmation
   Shared enhancement for every borrower-letter doc that has a
   contenteditable #letterPreview and a Reset-preview button. Adds:
     1. An "Edited — preview only" badge near the Reset button when
        the user types in the preview, so it is visually obvious
        that manual edits live in the preview only (the downloaded
        PDF rebuilds from the form fields).
     2. A confirm() gate on Reset when the preview is dirty, so a
        misclick doesn't blow away hand-typed text.
     3. A pre-edit affordance (a pencil icon that fades in on
        hover) so first-time users see the preview is editable.
   Per-doc JS still owns its own internal `previewDirty` (used to
   decide whether to auto-regenerate from fields). This module is
   purely the UX surface for that dirty state.
   ===================================================== */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    // Find the Reset button by walking up to the section header and
    // picking the first .btn-link in the same <h2> (all 5 docs follow
    // this pattern: section <h2> containing Reset button + gear).
    const section = preview.closest('.calc-section');
    if (!section) return;
    const resetBtn = section.querySelector('h2 .btn-link');
    if (!resetBtn) return;

    // Create a badge and place it right after the Reset button. Hidden
    // until the first keystroke in the preview.
    const badge = document.createElement('span');
    badge.className = 'preview-edited-badge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg> Edited <span class="preview-edited-badge__note">preview only</span>';
    resetBtn.insertAdjacentElement('afterend', badge);

    let dirty = false;

    function setDirty(next) {
      dirty = !!next;
      badge.hidden = !dirty;
      preview.classList.toggle('letter-preview--dirty', dirty);
    }

    // Ignore the very first `input` that fires from the doc JS
    // populating the preview programmatically. We only want USER edits
    // to flip the badge on. We detect programmatic writes by comparing
    // to the tick: if an input event arrives within 100ms of a field
    // change elsewhere on the form, we treat it as regenerate. This is
    // best-effort; the per-doc code already debounces its writes.
    let lastFieldChange = 0;
    document.querySelectorAll('.calc-section input, .calc-section select, .calc-section textarea').forEach(function (el) {
      el.addEventListener('input', function () { lastFieldChange = Date.now(); });
      el.addEventListener('change', function () { lastFieldChange = Date.now(); });
    });

    preview.addEventListener('input', function () {
      // If a form field was touched in the last 120ms, this is almost
      // certainly the per-doc generateLetter() re-rendering — not a
      // user edit to the preview.
      if (Date.now() - lastFieldChange < 120) return;
      if (!dirty) setDirty(true);
    });

    // Intercept Reset click in the capture phase so we can confirm
    // before the per-doc handler runs. Only confirm when dirty.
    resetBtn.addEventListener('click', function (e) {
      if (!dirty) return;
      const ok = window.confirm('Discard your manual edits to the preview and rebuild from the fields above?');
      if (!ok) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      setDirty(false);
    }, true);
  });
})();
