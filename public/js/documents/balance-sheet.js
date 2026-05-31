(function() {
  'use strict';

  function p(id) { return MSFG.parseNum(document.getElementById(id) ? document.getElementById(id).value : '0'); }
  const val = MSFG.val;
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  let assetRowsCtl = null, liabilityRowsCtl = null, equityRowsCtl = null;

  const FIELD_IDS = ['businessName','ownerName','asOfDate','cash','accountsReceivable','inventory','prepaidExpenses','propertyEquipment','otherAssets','accountsPayable','shortTermDebt','longTermDebt','otherLiabilities','ownerCapital','retainedEarnings'];
  let businessCtl = null;

  function cleanName() { return (val('businessName') || '').trim() || 'Business 1'; }

  function serialize() {
    const fields = {};
    FIELD_IDS.forEach(function (id) { fields[id] = val(id); });
    return { fields: fields, custom: {
      asset: assetRowsCtl ? assetRowsCtl.getRows() : [],
      liability: liabilityRowsCtl ? liabilityRowsCtl.getRows() : [],
      equity: equityRowsCtl ? equityRowsCtl.getRows() : []
    } };
  }
  function deserialize(snap) {
    snap = snap || { fields: {}, custom: {} };
    FIELD_IDS.forEach(function (id) { setVal(id, (snap.fields && snap.fields[id]) || ''); });
    if (assetRowsCtl) assetRowsCtl.setRows((snap.custom && snap.custom.asset) || []);
    if (liabilityRowsCtl) liabilityRowsCtl.setRows((snap.custom && snap.custom.liability) || []);
    if (equityRowsCtl) equityRowsCtl.setRows((snap.custom && snap.custom.equity) || []);
    calculate();
  }

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

  // Build the Assets/Liabilities/Owner's-Equity section group from a SNAPSHOT
  // (not the live form), so getEmailData can emit one group per business. Same
  // math as calculate(): standard fields + custom-row totals.
  function sectionsFor(snap, bizName) {
    snap = snap || { fields: {}, custom: {} };
    const f = snap.fields || {};
    const c = snap.custom || {};
    const assetCustomRows = c.asset || [];
    const liabilityCustomRows = c.liability || [];
    const equityCustomRows = c.equity || [];

    const cash = MSFG.parseNum(f.cash);
    const ar = MSFG.parseNum(f.accountsReceivable);
    const inventory = MSFG.parseNum(f.inventory);
    const prepaid = MSFG.parseNum(f.prepaidExpenses);
    const property = MSFG.parseNum(f.propertyEquipment);
    const otherA = MSFG.parseNum(f.otherAssets);
    const totalAssets = cash + ar + inventory + prepaid + property + otherA +
      assetCustomRows.reduce(function (a, r) { return a + r.amount; }, 0);

    const ap = MSFG.parseNum(f.accountsPayable);
    const shortDebt = MSFG.parseNum(f.shortTermDebt);
    const longDebt = MSFG.parseNum(f.longTermDebt);
    const otherL = MSFG.parseNum(f.otherLiabilities);
    const totalLiabilities = ap + shortDebt + longDebt + otherL +
      liabilityCustomRows.reduce(function (a, r) { return a + r.amount; }, 0);

    const ownerCap = MSFG.parseNum(f.ownerCapital);
    const retained = MSFG.parseNum(f.retainedEarnings);
    const totalEquity = ownerCap + retained +
      equityCustomRows.reduce(function (a, r) { return a + r.amount; }, 0);

    const name = (f.businessName || '').trim() || bizName;

    const assetRows = [
      { label: 'Cash & Equivalents', value: MSFG.formatCurrency(cash) },
      { label: 'Accounts Receivable', value: MSFG.formatCurrency(ar) },
      { label: 'Inventory', value: MSFG.formatCurrency(inventory) },
      { label: 'Prepaid Expenses', value: MSFG.formatCurrency(prepaid) },
      { label: 'Property & Equipment', value: MSFG.formatCurrency(property) },
      { label: 'Other Assets', value: MSFG.formatCurrency(otherA) }
    ];
    assetCustomRows.forEach(function (r) {
      assetRows.push({ label: r.label || 'Other asset', value: MSFG.formatCurrency(r.amount) });
    });
    assetRows.push({ label: 'Total Assets', value: MSFG.formatCurrency(totalAssets), isTotal: true });

    const liabRows = [
      { label: 'Accounts Payable', value: MSFG.formatCurrency(ap) },
      { label: 'Short-Term Debt', value: MSFG.formatCurrency(shortDebt) },
      { label: 'Long-Term Debt', value: MSFG.formatCurrency(longDebt) },
      { label: 'Other Liabilities', value: MSFG.formatCurrency(otherL) }
    ];
    liabilityCustomRows.forEach(function (r) {
      liabRows.push({ label: r.label || 'Other liability', value: MSFG.formatCurrency(r.amount) });
    });
    liabRows.push({ label: 'Total Liabilities', value: MSFG.formatCurrency(totalLiabilities), isTotal: true });

    const eqRows = [
      { label: "Owner's Capital", value: MSFG.formatCurrency(ownerCap) },
      { label: 'Retained Earnings', value: MSFG.formatCurrency(retained) }
    ];
    equityCustomRows.forEach(function (r) {
      eqRows.push({ label: r.label || 'Other equity', value: MSFG.formatCurrency(r.amount) });
    });
    eqRows.push({ label: 'Total Equity', value: MSFG.formatCurrency(totalEquity), isTotal: true });

    return [
      { heading: name + ' — Assets', rows: assetRows },
      { heading: name + ' — Liabilities', rows: liabRows },
      { heading: name + " — Owner's Equity", rows: eqRows }
    ];
  }

  function getEmailData() {
    const all = businessCtl ? businessCtl.getAll() : [{ name: cleanName(), snapshot: serialize() }];
    const sections = [];
    all.forEach(function (biz) {
      sectionsFor(biz.snapshot, biz.name).forEach(function (s) { sections.push(s); });
    });
    return { title: 'Balance Sheet', sections: sections };
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

    if (MSFG.MultiBusiness) {
      businessCtl = MSFG.MultiBusiness.init({ selectId: 'businessSelect', addBtnId: 'addBusiness', renameBtnId: 'renameBusiness', removeBtnId: 'removeBusiness', serialize: serialize, deserialize: deserialize });
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
