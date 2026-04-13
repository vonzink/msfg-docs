(function() {
  'use strict';

  function p(id) { return MSFG.parseNum(document.getElementById(id) ? document.getElementById(id).value : '0'); }
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  function calculate() {
    const cash = p('cash');
    const ar = p('accountsReceivable');
    const inventory = p('inventory');
    const prepaid = p('prepaidExpenses');
    const property = p('propertyEquipment');
    const otherA = p('otherAssets');
    const totalAssets = cash + ar + inventory + prepaid + property + otherA;

    const ap = p('accountsPayable');
    const shortDebt = p('shortTermDebt');
    const longDebt = p('longTermDebt');
    const otherL = p('otherLiabilities');
    const totalLiabilities = ap + shortDebt + longDebt + otherL;

    const ownerCap = p('ownerCapital');
    const retained = p('retainedEarnings');
    const totalEquity = ownerCap + retained;

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
    const assetRows = [
      { label: 'Cash & Equivalents', value: MSFG.formatCurrency(p('cash')) },
      { label: 'Accounts Receivable', value: MSFG.formatCurrency(p('accountsReceivable')) },
      { label: 'Inventory', value: MSFG.formatCurrency(p('inventory')) },
      { label: 'Prepaid Expenses', value: MSFG.formatCurrency(p('prepaidExpenses')) },
      { label: 'Property & Equipment', value: MSFG.formatCurrency(p('propertyEquipment')) },
      { label: 'Other Assets', value: MSFG.formatCurrency(p('otherAssets')) },
      { label: 'Total Assets', value: val('totalAssets'), isTotal: true }
    ];

    const liabRows = [
      { label: 'Accounts Payable', value: MSFG.formatCurrency(p('accountsPayable')) },
      { label: 'Short-Term Debt', value: MSFG.formatCurrency(p('shortTermDebt')) },
      { label: 'Long-Term Debt', value: MSFG.formatCurrency(p('longTermDebt')) },
      { label: 'Other Liabilities', value: MSFG.formatCurrency(p('otherLiabilities')) },
      { label: 'Total Liabilities', value: val('totalLiabilities'), isTotal: true }
    ];

    const eqRows = [
      { label: "Owner's Capital", value: MSFG.formatCurrency(p('ownerCapital')) },
      { label: 'Retained Earnings', value: MSFG.formatCurrency(p('retainedEarnings')) },
      { label: 'Total Equity', value: val('totalEquity'), isTotal: true }
    ];

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

    calculate();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('balance-sheet', function() {
        return getEmailData();
      });
    }
  });
})();
