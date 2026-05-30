/* MSFG.Borrowers — shared multi-borrower list for the letter docs.
   One text input + "include" checkbox + remove button per borrower.
   Seeded from MISMO (parsed.borrowers: string[]). The owning doc reads
   getSelected() into its payload; selected names drive salutation + signatures. */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }

  function init(cfg) {
    const container = document.getElementById(cfg.containerId || 'borrowersList');
    if (!container) return null;
    const onChange = typeof cfg.onChange === 'function' ? cfg.onChange : function () {};
    const label = cfg.rowLabel || 'Borrower';

    function row(name, include) {
      const wrap = el('div', 'borrowers-list__row');
      const inc = el('input', 'borrowers-list__include', { type: 'checkbox' });
      inc.checked = include !== false;
      const text = el('input', 'borrowers-list__name', { type: 'text', placeholder: label + ' name' });
      text.value = name || '';
      const rm = el('button', 'borrowers-list__remove', { type: 'button', 'aria-label': 'Remove ' + label });
      rm.textContent = '×';
      inc.addEventListener('change', onChange);
      text.addEventListener('input', onChange);
      rm.addEventListener('click', function () {
        if (container.querySelectorAll('.borrowers-list__row').length > 1) wrap.remove();
        else { text.value = ''; inc.checked = true; }
        onChange();
      });
      wrap.appendChild(inc); wrap.appendChild(text); wrap.appendChild(rm);
      return wrap;
    }

    function addRow(name, include) { container.appendChild(row(name, include)); }

    function getAll() {
      return Array.prototype.map.call(container.querySelectorAll('.borrowers-list__row'), function (r) {
        return { name: (r.querySelector('.borrowers-list__name').value || '').trim(),
                 include: r.querySelector('.borrowers-list__include').checked };
      });
    }
    function getSelected() { return getAll().filter(function (b) { return b.include && b.name; }); }

    function seed(names) {
      const list = (names || []).map(function (n) { return String(n || '').trim(); }).filter(Boolean);
      if (!list.length) return;
      const existing = getAll().filter(function (b) { return b.name; });
      if (existing.length) return; // user already has names; don't clobber
      container.innerHTML = '';
      list.forEach(function (n) { addRow(n, true); });
      onChange();
    }

    const addBtn = cfg.addBtnId && document.getElementById(cfg.addBtnId);
    if (addBtn) addBtn.addEventListener('click', function () { addRow('', true); onChange(); });

    if (!container.querySelector('.borrowers-list__row')) addRow('', true); // start with one
    return { addRow, getAll, getSelected, seed };
  }

  /** Join names: ["A"]→"A", ["A","B"]→"A and B", ["A","B","C"]→"A, B, and C". */
  function joinNames(names) {
    const a = (names || []).filter(Boolean);
    if (a.length <= 1) return a[0] || '';
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  }

  MSFG.Borrowers = { init, joinNames };
})();
