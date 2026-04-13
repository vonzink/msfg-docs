(function() {
  'use strict';

  function p(id) { return MSFG.parseNum(document.getElementById(id) ? document.getElementById(id).value : '0'); }
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  function calculate() {
    const grossSales = p('grossSales');
    const otherIncome = p('otherIncome');
    const returns = p('returnsAllowances');
    const totalRevenue = grossSales + otherIncome - returns;

    const costOfGoods = p('costOfGoods');
    const wages = p('wages');
    const rent = p('rent');
    const utilities = p('utilities');
    const insurance = p('insurance');
    const depreciation = p('depreciation');
    const interest = p('interestExpense');
    const other = p('otherExpenses');
    const totalExpenses = costOfGoods + wages + rent + utilities + insurance + depreciation + interest + other;

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

  function getEmailData() {
    const revenueRows = [
      { label: 'Gross Sales / Revenue', value: MSFG.formatCurrency(p('grossSales')) },
      { label: 'Other Income', value: MSFG.formatCurrency(p('otherIncome')) },
      { label: 'Returns & Allowances', value: MSFG.formatCurrency(p('returnsAllowances')) },
      { label: 'Total Revenue', value: val('totalRevenue'), isTotal: true }
    ];

    const expenseRows = [
      { label: 'Cost of Goods Sold', value: MSFG.formatCurrency(p('costOfGoods')) },
      { label: 'Wages & Salaries', value: MSFG.formatCurrency(p('wages')) },
      { label: 'Rent / Lease', value: MSFG.formatCurrency(p('rent')) },
      { label: 'Utilities', value: MSFG.formatCurrency(p('utilities')) },
      { label: 'Insurance', value: MSFG.formatCurrency(p('insurance')) },
      { label: 'Depreciation', value: MSFG.formatCurrency(p('depreciation')) },
      { label: 'Interest Expense', value: MSFG.formatCurrency(p('interestExpense')) },
      { label: 'Other Expenses', value: MSFG.formatCurrency(p('otherExpenses')) },
      { label: 'Total Expenses', value: val('totalExpenses'), isTotal: true }
    ];

    const netIncome = p('grossSales') + p('otherIncome') - p('returnsAllowances') -
      (p('costOfGoods') + p('wages') + p('rent') + p('utilities') + p('insurance') +
       p('depreciation') + p('interestExpense') + p('otherExpenses'));

    const summaryRows = [
      { label: 'Net Income', value: MSFG.formatCurrency(netIncome), bold: true, isTotal: true }
    ];

    const sections = [
      { heading: 'Revenue', rows: revenueRows },
      { heading: 'Expenses', rows: expenseRows },
      { heading: 'Summary', rows: summaryRows }
    ];

    const businessName = val('businessName');
    if (businessName) {
      sections.unshift({ heading: 'Business Info', rows: [
        { label: 'Business', value: businessName },
        { label: 'Owner', value: val('ownerName') },
        { label: 'Period', value: val('periodStart') + ' to ' + val('periodEnd') }
      ]});
    }

    return { title: 'Income Statement' + (businessName ? ' — ' + businessName : ''), sections: sections };
  }

  document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('.doc-page input[type="text"]:not([readonly]), .doc-page input[type="number"]');
    inputs.forEach(function(el) {
      el.addEventListener('input', calculate);
    });

    calculate();

    if (MSFG.DocActions) MSFG.DocActions.register(getEmailData);

    if (MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('income-statement', function() {
        return getEmailData();
      });
    }
  });
})();
