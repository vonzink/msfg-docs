/* =====================================================
   MSFG.MultiBusiness — hold several businesses in one financial
   form. Snapshots the whole form (via doc-supplied serialize) per
   business and restores it on switch (deserialize). The doc owns
   what a snapshot contains (standard fields + custom rows); this
   module owns the list + the switcher UI.
   ===================================================== */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});
  let _seq = 0;
  function nextId() { _seq += 1; return 'biz_' + _seq; }

  function init(opts) {
    const select = document.getElementById(opts.selectId);
    const addBtn = document.getElementById(opts.addBtnId);
    const renameBtn = opts.renameBtnId ? document.getElementById(opts.renameBtnId) : null;
    const removeBtn = opts.removeBtnId ? document.getElementById(opts.removeBtnId) : null;
    const serialize = opts.serialize;     // () => snapshot
    const deserialize = opts.deserialize; // (snapshot) => void
    if (!select || typeof serialize !== 'function' || typeof deserialize !== 'function') return null;

    const businesses = [{ id: nextId(), name: 'Business 1', snapshot: null }];
    let active = 0;

    function label(b, i) { return b.name && b.name.trim() ? b.name : ('Business ' + (i + 1)); }
    function refresh() {
      select.innerHTML = '';
      businesses.forEach(function (b, i) {
        const o = document.createElement('option');
        o.value = String(i); o.textContent = label(b, i);
        select.appendChild(o);
      });
      select.value = String(active);
    }
    function saveActive() { businesses[active].snapshot = serialize(); }
    function loadActive() { deserialize(businesses[active].snapshot || { fields: {}, custom: {} }); }

    select.addEventListener('change', function () {
      saveActive();
      active = parseInt(select.value, 10) || 0;
      loadActive();
    });
    if (addBtn) addBtn.addEventListener('click', function () {
      saveActive();
      businesses.push({ id: nextId(), name: 'Business ' + (businesses.length + 1), snapshot: null });
      active = businesses.length - 1;
      deserialize({ fields: {}, custom: {} }); // clear the form for the new business
      refresh();
    });
    if (renameBtn) renameBtn.addEventListener('click', function () {
      const name = window.prompt('Business name:', businesses[active].name);
      if (name != null) { businesses[active].name = name.trim() || businesses[active].name; refresh(); }
    });
    if (removeBtn) removeBtn.addEventListener('click', function () {
      if (businesses.length <= 1) return;
      businesses.splice(active, 1);
      active = Math.max(0, active - 1);
      loadActive();
      refresh();
    });

    refresh();

    return {
      // Snapshot the current form into the active business, then return all
      // businesses (so the PDF builder can emit one statement each).
      getAll: function () { saveActive(); return businesses.map(function (b, i) { return { name: label(b, i), snapshot: b.snapshot }; }); },
      activeName: function () { return label(businesses[active], active); }
    };
  }

  MSFG.MultiBusiness = { init: init };
})();
