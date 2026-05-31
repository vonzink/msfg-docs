(function() {
  'use strict';

  function p(id) { return MSFG.parseNum(document.getElementById(id) ? document.getElementById(id).value : '0'); }
  const val = MSFG.val;
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  let assetRowsCtl = null, liabilityRowsCtl = null, equityRowsCtl = null;

  function calculate() {
    const cash = p('cash');
    const ar = p('accountsReceivable');
    const inventory = p('inventory');
    const prepaid = p('prepaidExpenses');
    const property = p('propertyEquipment');
    const otherA = p('otherAssets');
    const totalAssets = cash + ar + inventory + prepaid + property + otherA + (assetRowsCtl ? assetRowsCtl.total() : 0);

    const ap = p('accountsPayable');
    const shortDebt = p('shortTermDebt');
    const longDebt = p('longTermDebt');
    const otherL = p('otherLiabilities');
    const totalLiabilities = ap + shortDebt + longDebt + otherL + (liabilityRowsCtl ? liabilityRowsCtl.total() : 0);

    const ownerCap = p('ownerCapital');
    const retained = p('retainedEarnings');
    const totalEquity = ownerCap + retained + (equityRowsCtl ? equityRowsCtl.total() : 0);

    setVal('totalAssets', MSFG.formatCurrency(totalAssets));
    setVal('totalLiabilities', MSFG.formatCurrency(totalLiabilities));
    setVal('totalEquity', MSFG.formatCurrency(totalEquity));

    const rA = document.getElementById('resultAssets');
    const rL = document.getElementById('resultLiabilities');
    const rE = document.getElementById('resultEquity');

    if (rA) rA.textContent = MSFG.formatCurrency(totalAssets);
    if (rL) rL.textContent = MSFG.formatCurrency(totalLiabilities);
    if (rE) rE.textContent = MSFG.formatCurrency(totalEquity);

    // Balance check
    const check = document.getElementById('balanceCheck');
    if (check) {
      const diff = totalAssets - (totalLiabilities + totalEquity);
      if (totalAssets > 0 || totalLiabilities > 0 || totalEquity > 0) {
        check.style.display = '';
        if (Math.abs(diff) < 0.01) {
          check.className = 'alert alert-info u-mt-md';
          check.textContent = 'Balance sheet is balanced. Assets = Liabilities + Equity';
        } else {
          check.className = 'alert alert-warning u-mt-md';
          check.textContent = 'Out of balance by ' + MSFG.formatCurrency(Math.abs(diff)) + '. Assets should equal Liabilities + Equity.';
        }
      } else {
        check.style.display = 'none';
      }
    }
  }

  function getEmailData() {
    const assetCustomRows = assetRowsCtl ? assetRowsCtl.getRows() : [];
    const liabilityCustomRows = liabilityRowsCtl ? liabilityRowsCtl.getRows() : [];
    const equityCustomRows = equityRowsCtl ? equityRowsCtl.getRows() : [];

    const assetRows = [
      { label: 'Cash & Equivalents', value: MSFG.formatCurrency(p('cash')) },
      { label: 'Accounts Receivable', value: MSFG.formatCurrency(p('accountsReceivable')) },
      { label: 'Inventory', value: MSFG.formatCurrency(p('inventory')) },
      { label: 'Prepaid Expenses', value: MSFG.formatCurrency(p('prepaidExpenses')) },
      { label: 'Property & Equipment', value: MSFG.formatCurrency(p('propertyEquipment')) },
      { label: 'Other Assets', value: MSFG.formatCurrency(p('otherAssets')) }
    ];
    assetCustomRows.forEach(function (r) {
      assetRows.push({ label: r.label || 'Other asset', value: MSFG.formatCurrency(r.amount) });
    });
    assetRows.push({ label: 'Total Assets', value: val('totalAssets'), isTotal: true });

    const liabRows = [
      { label: 'Accounts Payable', value: MSFG.formatCurrency(p('accountsPayable')) },
      { label: 'Short-Term Debt', value: MSFG.formatCurrency(p('shortTermDebt')) },
      { label: 'Long-Term Debt', value: MSFG.formatCurrency(p('longTermDebt')) },
      { label: 'Other Liabilities', value: MSFG.formatCurrency(p('otherLiabilities')) }
    ];
    liabilityCustomRows.forEach(function (r) {
      liabRows.push({ label: r.label || 'Other liability', value: MSFG.formatCurrency(r.amount) });
    });
    liabRows.push({ label: 'Total Liabilities', value: val('totalLiabilities'), isTotal: true });

    const eqRows = [
      { label: "Owner's Capital", value: MSFG.formatCurrency(p('ownerCapital')) },
      { label: 'Retained Earnings', value: MSFG.formatCurrency(p('retainedEarnings')) }
    ];
    equityCustomRows.forEach(function (r) {
      eqRows.push({ label: r.label || 'Other equity', value: MSFG.formatCurrency(r.amount) });
    });
    eqRows.push({ label: 'Total Equity', value: val('totalEquity'), isTotal: true });

    const sections = [
      { heading: 'Assets', rows: assetRows },
      { heading: 'Liabilities', rows: liabRows },
      { heading: "Owner's Equity", rows: eqRows }
    ];

    const businessName = val('businessName');
    if (businessName) {
      sections.unshift({ heading: 'Business Info', rows: [
        { label: 'Business', value: businessName },
        { label: 'Owner', value: val('ownerName') },
        { label: 'As Of', value: val('asOfDate') }
      ]});
    }

    return { title: 'Balance Sheet' + (businessName ? ' — ' + businessName : ''), sections: sections };
  }

  document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('.doc-page input[type="text"]:not([readonly]), .doc-page input[type="number"]');
    inputs.forEach(function(el) {
      el.addEventListener('input', calculate);
    });

    if (MSFG.CustomRows) {
      assetRowsCtl = MSFG.CustomRows.init({ tbodyId: 'assetCustomRows', addBtnId: 'addAssetRow', labelPlaceholder: 'Asset line', onChange: calculate });
      liabilityRowsCtl = MSFG.CustomRows.init({ tbodyId: 'liabilityCustomRows', addBtnId: 'addLiabilityRow', labelPlaceholder: 'Liability line', onChange: calculate });
      equityRowsCtl = MSFG.CustomRows.init({ tbodyId: 'equityCustomRows', addBtnId: 'addEquityRow', labelPlaceholder: 'Equity line', onChange: calculate });
    }

    calculate();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('balance-sheet', function() {
        return getEmailData();
      });
    }
  });
})();
