/* =====================================================
   MSFG.CustomRows — dynamic {label, amount} line items for a
   financial-statement section. One instance per section (e.g.
   Revenue, Expenses, Assets). Rows live in a <tbody>; each row is
   a label input + amount input + remove button. Mirrors the
   credit-inquiry add-row pattern.
   ===================================================== */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});

  function init(opts) {
    const tbody = document.getElementById(opts.tbodyId);
    const addBtn = document.getElementById(opts.addBtnId);
    const onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    if (!tbody) return null;

    function makeRow(data) {
      data = data || {};
      const tr = document.createElement('tr');
      tr.className = 'custom-rows__row';
      tr.innerHTML =
        '<td><input type="text" class="custom-rows__label" placeholder="' +
          (opts.labelPlaceholder || 'Description') + '"></td>' +
        '<td><input type="text" inputmode="decimal" class="custom-rows__amount" placeholder="0.00"></td>' +
        '<td><button type="button" class="custom-rows__remove" title="Remove line">×</button></td>';
      tr.querySelector('.custom-rows__label').value = data.label != null ? String(data.label) : '';
      tr.querySelector('.custom-rows__amount').value = data.amount != null && data.amount !== '' ? String(data.amount) : '';
      tr.querySelectorAll('input').forEach(function (el) {
        el.addEventListener('input', onChange);
        el.addEventListener('change', onChange);
      });
      tr.querySelector('.custom-rows__remove').addEventListener('click', function () {
        tr.remove();
        onChange();
      });
      return tr;
    }

    function addRow(data) { const tr = makeRow(data); tbody.appendChild(tr); return tr; }

    if (addBtn) addBtn.addEventListener('click', function () { addRow(); onChange(); });

    return {
      addRow: addRow,
      // [{label, amount(number)}] — blank rows (no label AND no amount) are dropped.
      getRows: function () {
        return Array.prototype.slice.call(tbody.querySelectorAll('.custom-rows__row')).map(function (tr) {
          const label = tr.querySelector('.custom-rows__label').value.trim();
          const amount = MSFG.parseNum(tr.querySelector('.custom-rows__amount').value);
          return { label: label, amount: amount };
        }).filter(function (r) { return r.label !== '' || r.amount !== 0; });
      },
      total: function () {
        return this.getRows().reduce(function (a, r) { return a + r.amount; }, 0);
      },
      setRows: function (rows) {
        tbody.innerHTML = '';
        (rows || []).forEach(function (r) { addRow(r); });
      }
    };
  }

  MSFG.CustomRows = { init: init };
})();
