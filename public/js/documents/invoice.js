(function() {
  'use strict';

  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function createRow() {
    const tr = document.createElement('tr');
    tr.className = 'line-item';
    tr.innerHTML =
      '<td><input type="text" class="item-desc" placeholder="Service or product"></td>' +
      '<td><input type="number" class="item-qty" value="1" min="0" step="1"></td>' +
      '<td><input type="text" class="item-price" placeholder="$0.00"></td>' +
      '<td class="item-amount">$0.00</td>' +
      '<td><button type="button" class="btn btn-sm" data-action="remove-row" title="Remove">&times;</button></td>';
    return tr;
  }

  function calculate() {
    let subtotal = 0;
    const rows = document.querySelectorAll('#lineItems .line-item');
    rows.forEach(function(row) {
      const qty = MSFG.parseNum(row.querySelector('.item-qty').value);
      const price = MSFG.parseNum(row.querySelector('.item-price').value);
      const amount = qty * price;
      row.querySelector('.item-amount').textContent = MSFG.formatCurrency(amount);
      subtotal += amount;
    });

    const taxRate = MSFG.parseNum(document.getElementById('taxRate') ? document.getElementById('taxRate').value : '0');
    const discount = MSFG.parseNum(document.getElementById('discount') ? document.getElementById('discount').value : '0');
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax - discount;

    const rSubtotal = document.getElementById('resultSubtotal');
    const rTax = document.getElementById('resultTax');
    const rTotal = document.getElementById('resultTotal');

    if (rSubtotal) rSubtotal.textContent = MSFG.formatCurrency(subtotal);
    if (rTax) rTax.textContent = MSFG.formatCurrency(tax);
    if (rTotal) rTotal.textContent = MSFG.formatCurrency(total);
  }

  function getEmailData() {
    const lineItems = [];
    let subtotal = 0;
    document.querySelectorAll('#lineItems .line-item').forEach(function(row) {
      const desc = row.querySelector('.item-desc').value.trim();
      const qty = MSFG.parseNum(row.querySelector('.item-qty').value);
      const price = MSFG.parseNum(row.querySelector('.item-price').value);
      const amount = qty * price;
      if (desc || amount > 0) {
        lineItems.push({ label: desc + ' (x' + qty + ')', value: MSFG.formatCurrency(amount) });
        subtotal += amount;
      }
    });

    const taxRate = MSFG.parseNum(val('taxRate'));
    const discount = MSFG.parseNum(val('discount'));
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax - discount;

    const infoRows = [];
    if (val('invoiceNumber')) infoRows.push({ label: 'Invoice #', value: val('invoiceNumber') });
    if (val('invoiceDate')) infoRows.push({ label: 'Date', value: val('invoiceDate') });
    if (val('dueDate')) infoRows.push({ label: 'Due Date', value: val('dueDate') });
    if (val('fromName')) infoRows.push({ label: 'From', value: val('fromName') });
    if (val('toName')) infoRows.push({ label: 'To', value: val('toName') });

    lineItems.push({ label: 'Subtotal', value: MSFG.formatCurrency(subtotal), isTotal: true });
    if (taxRate > 0) lineItems.push({ label: 'Tax (' + taxRate + '%)', value: MSFG.formatCurrency(tax) });
    if (discount > 0) lineItems.push({ label: 'Discount', value: '-' + MSFG.formatCurrency(discount) });
    lineItems.push({ label: 'Total Due', value: MSFG.formatCurrency(total), bold: true, isTotal: true });

    const sections = [];
    if (infoRows.length) sections.push({ heading: 'Invoice Details', rows: infoRows });
    sections.push({ heading: 'Line Items', rows: lineItems });

    if (val('paymentInstructions')) {
      sections.push({ heading: 'Payment Instructions', rows: [{ label: val('paymentInstructions'), value: '', stacked: true }] });
    }

    return { title: 'Invoice' + (val('invoiceNumber') ? ' ' + val('invoiceNumber') : ''), sections: sections };
  }

  document.addEventListener('DOMContentLoaded', function() {
    const lineItemsBody = document.getElementById('lineItems');
    const addBtn = document.getElementById('addLineItem');

    if (addBtn) {
      addBtn.addEventListener('click', function() {
        const row = createRow();
        lineItemsBody.appendChild(row);
        bindRowEvents(row);
        row.querySelector('.item-desc').focus();
      });
    }

    // Delegated remove handler
    if (lineItemsBody) {
      lineItemsBody.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-action="remove-row"]');
        if (btn) {
          const row = btn.closest('.line-item');
          if (lineItemsBody.querySelectorAll('.line-item').length > 1) {
            row.remove();
            calculate();
          }
        }
      });
    }

    function bindRowEvents(row) {
      row.querySelectorAll('input').forEach(function(input) {
        input.addEventListener('input', calculate);
      });
    }

    // Bind initial row
    document.querySelectorAll('#lineItems .line-item').forEach(bindRowEvents);

    // Bind other inputs
    ['taxRate', 'discount'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', calculate);
    });

    calculate();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('invoice', function() {
        return getEmailData();
      });
    }
  });
})();
