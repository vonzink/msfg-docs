(function() {
  'use strict';

  function p(id) { return MSFG.parseNum(document.getElementById(id) ? document.getElementById(id).value : '0'); }
  const val = MSFG.val;
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  let revenueRowsCtl = null;
  let expenseRowsCtl = null;

  const FIELD_IDS = ['businessName','ownerName','periodStart','periodEnd','grossSales','otherIncome','returnsAllowances','costOfGoods','wages','rent','utilities','insurance','depreciation','interestExpense','otherExpenses'];
  let businessCtl = null;

  function cleanName() { return (val('businessName') || '').trim() || 'Business 1'; }

  function serialize() {
    const fields = {};
    FIELD_IDS.forEach(function (id) { fields[id] = val(id); });
    return { fields: fields, custom: {
      revenue: revenueRowsCtl ? revenueRowsCtl.getRows() : [],
      expense: expenseRowsCtl ? expenseRowsCtl.getRows() : []
    } };
  }
  function deserialize(snap) {
    snap = snap || { fields: {}, custom: {} };
    FIELD_IDS.forEach(function (id) { setVal(id, (snap.fields && snap.fields[id]) || ''); });
    if (revenueRowsCtl) revenueRowsCtl.setRows((snap.custom && snap.custom.revenue) || []);
    if (expenseRowsCtl) expenseRowsCtl.setRows((snap.custom && snap.custom.expense) || []);
    calculate();
  }

  function calculate() {
    const revenueCustom = revenueRowsCtl ? revenueRowsCtl.total() : 0;
    const expenseCustom = expenseRowsCtl ? expenseRowsCtl.total() : 0;

    const grossSales = p('grossSales');
    const otherIncome = p('otherIncome');
    const returns = p('returnsAllowances');
    const totalRevenue = grossSales + otherIncome - returns + revenueCustom;

    const costOfGoods = p('costOfGoods');
    const wages = p('wages');
    const rent = p('rent');
    const utilities = p('utilities');
    const insurance = p('insurance');
    const depreciation = p('depreciation');
    const interest = p('interestExpense');
    const other = p('otherExpenses');
    const totalExpenses = costOfGoods + wages + rent + utilities + insurance + depreciation + interest + other + expenseCustom;

    const netIncome = totalRevenue - totalExpenses;

    setVal('totalRevenue', MSFG.formatCurrency(totalRevenue));
    setVal('totalExpenses', MSFG.formatCurrency(totalExpenses));

    const rRevenue = document.getElementById('resultRevenue');
    const rExpenses = document.getElementById('resultExpenses');
    const rNet = document.getElementById('resultNetIncome');

    if (rRevenue) rRevenue.textContent = MSFG.formatCurrency(totalRevenue);
    if (rExpenses) rExpenses.textContent = MSFG.formatCurrency(totalExpenses);
    if (rNet) {
      rNet.textContent = MSFG.formatCurrency(netIncome);
      rNet.className = 'result-card__value ' + (netIncome >= 0 ? 'success' : 'danger');
    }
  }

  // Build the Revenue/Expenses/Summary section group from a SNAPSHOT (not the
  // live form), so getEmailData can emit one group per business. Same math as
  // calculate(): standard fields + custom-row totals.
  function sectionsFor(snap, bizName) {
    snap = snap || { fields: {}, custom: {} };
    const f = snap.fields || {};
    const c = snap.custom || {};
    const revenueCustomRows = c.revenue || [];
    const expenseCustomRows = c.expense || [];
    const revenueCustom = revenueCustomRows.reduce(function (a, r) { return a + r.amount; }, 0);
    const expenseCustom = expenseCustomRows.reduce(function (a, r) { return a + r.amount; }, 0);

    const grossSales = MSFG.parseNum(f.grossSales);
    const otherIncome = MSFG.parseNum(f.otherIncome);
    const returns = MSFG.parseNum(f.returnsAllowances);
    const totalRevenue = grossSales + otherIncome - returns + revenueCustom;

    const costOfGoods = MSFG.parseNum(f.costOfGoods);
    const wages = MSFG.parseNum(f.wages);
    const rent = MSFG.parseNum(f.rent);
    const utilities = MSFG.parseNum(f.utilities);
    const insurance = MSFG.parseNum(f.insurance);
    const depreciation = MSFG.parseNum(f.depreciation);
    const interest = MSFG.parseNum(f.interestExpense);
    const other = MSFG.parseNum(f.otherExpenses);
    const totalExpenses = costOfGoods + wages + rent + utilities + insurance + depreciation + interest + other + expenseCustom;

    const netIncome = totalRevenue - totalExpenses;

    const name = (f.businessName || '').trim() || bizName;

    const revenueRows = [
      { label: 'Gross Sales / Revenue', value: MSFG.formatCurrency(grossSales) },
      { label: 'Other Income', value: MSFG.formatCurrency(otherIncome) },
      { label: 'Returns & Allowances', value: MSFG.formatCurrency(returns) }
    ];
    revenueCustomRows.forEach(function (r) {
      revenueRows.push({ label: r.label || 'Other revenue', value: MSFG.formatCurrency(r.amount) });
    });
    revenueRows.push({ label: 'Total Revenue', value: MSFG.formatCurrency(totalRevenue), isTotal: true });

    const expenseRows = [
      { label: 'Cost of Goods Sold', value: MSFG.formatCurrency(costOfGoods) },
      { label: 'Wages & Salaries', value: MSFG.formatCurrency(wages) },
      { label: 'Rent / Lease', value: MSFG.formatCurrency(rent) },
      { label: 'Utilities', value: MSFG.formatCurrency(utilities) },
      { label: 'Insurance', value: MSFG.formatCurrency(insurance) },
      { label: 'Depreciation', value: MSFG.formatCurrency(depreciation) },
      { label: 'Interest Expense', value: MSFG.formatCurrency(interest) },
      { label: 'Other Expenses', value: MSFG.formatCurrency(other) }
    ];
    expenseCustomRows.forEach(function (r) {
      expenseRows.push({ label: r.label || 'Other expense', value: MSFG.formatCurrency(r.amount) });
    });
    expenseRows.push({ label: 'Total Expenses', value: MSFG.formatCurrency(totalExpenses), isTotal: true });

    return [
      { heading: name + ' — Revenue', rows: revenueRows },
      { heading: name + ' — Expenses', rows: expenseRows },
      { heading: name + ' — Summary', rows: [
        { label: 'Net Income', value: MSFG.formatCurrency(netIncome), bold: true, isTotal: true }
      ] }
    ];
  }

  function getEmailData() {
    const all = businessCtl ? businessCtl.getAll() : [{ name: cleanName(), snapshot: serialize() }];
    const sections = [];
    all.forEach(function (biz) {
      sectionsFor(biz.snapshot, biz.name).forEach(function (s) { sections.push(s); });
    });
    return { title: 'Income Statement', sections: sections };
  }

  document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('.doc-page input[type="text"]:not([readonly]), .doc-page input[type="number"]');
    inputs.forEach(function(el) {
      el.addEventListener('input', calculate);
    });

    if (MSFG.CustomRows) {
      revenueRowsCtl = MSFG.CustomRows.init({ tbodyId: 'revenueCustomRows', addBtnId: 'addRevenueRow', labelPlaceholder: 'Revenue line', onChange: calculate });
      expenseRowsCtl = MSFG.CustomRows.init({ tbodyId: 'expenseCustomRows', addBtnId: 'addExpenseRow', labelPlaceholder: 'Expense line', onChange: calculate });
    }

    if (MSFG.MultiBusiness) {
      businessCtl = MSFG.MultiBusiness.init({ selectId: 'businessSelect', addBtnId: 'addBusiness', renameBtnId: 'renameBusiness', removeBtnId: 'removeBusiness', serialize: serialize, deserialize: deserialize });
    }

    calculate();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('income-statement', function() {
        return getEmailData();
      });
    }
  });
})();
