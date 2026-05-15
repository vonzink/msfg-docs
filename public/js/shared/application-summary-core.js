'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MSFG = root.MSFG || {};
    root.MSFG.ApplicationSummary = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REQUIRED_MONTHS = 24;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = parseFloat(text(value).replace(/[$,%\s,]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) {
      const v = text(arguments[i]);
      if (v) return v;
    }
    return '';
  }

  function parseDate(value) {
    const raw = text(value);
    if (!raw) return null;
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slash) {
      let year = Number(slash[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
    }
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function monthsBetween(startValue, endValue, now) {
    const start = parseDate(startValue);
    if (!start) return 0;
    const end = parseDate(endValue) || now || new Date();
    if (end < start) return 0;
    let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
    months += end.getUTCMonth() - start.getUTCMonth();
    if (end.getUTCDate() >= start.getUTCDate()) months += 1;
    return Math.max(0, months);
  }

  function durationMonths(item, now) {
    if (!item) return 0;
    const explicitMonths = toNumber(firstNonEmpty(
      item.durationMonths,
      item.monthsCount,
      item.totalMonths
    ));
    const years = toNumber(item.years);
    const months = toNumber(item.months);
    if (years || months) return Math.round(years * 12 + months);
    if (explicitMonths) return Math.round(explicitMonths);
    return monthsBetween(item.startDate, item.endDate, now);
  }

  function coverage(records, options) {
    const now = options && options.now ? options.now : new Date();
    const coveredMonths = (Array.isArray(records) ? records : []).reduce(function (sum, item) {
      return sum + durationMonths(item, now);
    }, 0);
    const missingMonths = Math.max(0, REQUIRED_MONTHS - coveredMonths);
    return {
      requiredMonths: REQUIRED_MONTHS,
      coveredMonths,
      missingMonths,
      status: missingMonths > 0 ? 'needs-review' : 'complete'
    };
  }

  function coverageByBorrower(records, borrowers, options) {
    const names = (Array.isArray(borrowers) ? borrowers : []).map(text).filter(Boolean);
    if (!names.length) return coverage(records, options);

    const summaries = names.map(function (name) {
      const borrowerRecords = (Array.isArray(records) ? records : []).filter(function (record) {
        return text(record.borrowerName).toLowerCase() === name.toLowerCase();
      });
      const summary = coverage(borrowerRecords, options);
      summary.borrowerName = name;
      return summary;
    });

    const missing = summaries.filter(function (summary) { return summary.status !== 'complete'; });
    return {
      requiredMonths: REQUIRED_MONTHS,
      coveredMonths: summaries.length ? Math.min.apply(null, summaries.map(function (summary) { return summary.coveredMonths; })) : 0,
      missingMonths: missing.length ? Math.max.apply(null, missing.map(function (summary) { return summary.missingMonths; })) : 0,
      status: missing.length ? 'needs-review' : 'complete',
      byBorrower: summaries
    };
  }

  function formatMonths(months) {
    const total = Math.max(0, Math.round(toNumber(months)));
    const years = Math.floor(total / 12);
    const rem = total % 12;
    if (years && rem) return years + ' yr ' + rem + ' mo';
    if (years) return years + (years === 1 ? ' yr' : ' yrs');
    return rem + (rem === 1 ? ' mo' : ' mos');
  }

  function formatCurrency(value) {
    const n = toNumber(value);
    if (!n) return '';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function statusLabel(summary) {
    if (!summary || summary.status !== 'complete') return 'Needs review';
    return 'Complete';
  }

  function normalizeHistory(items, now) {
    return (Array.isArray(items) ? items : []).map(function (item) {
      const months = durationMonths(item, now);
      return Object.assign({}, item, {
        borrowerName: text(item.borrowerName),
        type: text(item.type || item.status || item.kind),
        address: text(item.address),
        employerName: text(item.employerName || item.name),
        title: text(item.title || item.position),
        startDate: text(item.startDate),
        endDate: text(item.endDate),
        durationMonths: months,
        durationLabel: formatMonths(months),
        monthlyIncome: text(item.monthlyIncome) || text(item.income)
      });
    });
  }

  function actionItemsForSummary(summary, area, messageBuilder) {
    const items = [];
    const byBorrower = Array.isArray(summary.byBorrower) && summary.byBorrower.length ? summary.byBorrower : [summary];
    byBorrower.forEach(function (item) {
      if (item.status === 'complete') return;
      items.push({
        area,
        borrowerName: item.borrowerName || '',
        message: messageBuilder(item)
      });
    });
    return items;
  }

  function sameName(a, b) {
    return text(a).toLowerCase() === text(b).toLowerCase();
  }

  function recordsForBorrower(records, borrowerName) {
    const name = text(borrowerName);
    if (!name) return Array.isArray(records) ? records : [];
    return (Array.isArray(records) ? records : []).filter(function (record) {
      if (Array.isArray(record.borrowerNames) && record.borrowerNames.some(function (item) { return sameName(item, name); })) {
        return true;
      }
      return sameName(record.borrowerName, name);
    });
  }

  function profileForBorrower(profiles, borrowerName) {
    const name = text(borrowerName);
    const profile = (Array.isArray(profiles) ? profiles : []).find(function (item) {
      return sameName(item && item.name, name);
    });
    return profile || { name };
  }

  function hasBorrowerOwnership(records) {
    return (Array.isArray(records) ? records : []).some(function (record) {
      return text(record && record.borrowerName) || (Array.isArray(record && record.borrowerNames) && record.borrowerNames.length);
    });
  }

  function assetRecordsForBorrower(records, borrowerName) {
    if (!hasBorrowerOwnership(records)) return Array.isArray(records) ? records : [];
    return recordsForBorrower(records, borrowerName);
  }

  function isReoAsset(asset) {
    return text(asset && asset.type).toLowerCase() === 'realestateowned' || Boolean(asset && asset.isReo);
  }

  function buildBorrowerPages(borrowers, borrowerProfiles, residences, employments, assets, liabilities, declarationSummaries, now) {
    return (Array.isArray(borrowers) ? borrowers : []).map(function (borrowerName) {
      const profile = profileForBorrower(borrowerProfiles, borrowerName);
      const borrowerResidences = recordsForBorrower(residences, borrowerName);
      const borrowerEmployments = recordsForBorrower(employments, borrowerName);
      const borrowerAssets = assetRecordsForBorrower(assets, borrowerName);
      const borrowerLiabilities = recordsForBorrower(liabilities, borrowerName);
      const borrowerDeclarations = recordsForBorrower(declarationSummaries, borrowerName);
      const residenceCoverage = coverage(borrowerResidences, { now });
      residenceCoverage.borrowerName = borrowerName;
      const employmentCoverage = coverage(borrowerEmployments, { now });
      employmentCoverage.borrowerName = borrowerName;
      const actionItems = []
        .concat(actionItemsForSummary(residenceCoverage, 'Residence', function (item) {
          return 'Add prior address history for ' + formatMonths(item.missingMonths) + ' to reach the required two years.';
        }))
        .concat(actionItemsForSummary(employmentCoverage, 'Employment', function (item) {
          return 'Add prior employment history for ' + formatMonths(item.missingMonths) + ' to reach the required two years.';
        }));

      return {
        borrowerName,
        borrowerProfile: profile,
        residences: borrowerResidences,
        employments: borrowerEmployments,
        assets: borrowerAssets,
        reoProperties: borrowerAssets.filter(isReoAsset),
        liabilities: borrowerLiabilities,
        declarationSummaries: borrowerDeclarations,
        residenceCoverage,
        employmentCoverage,
        actionItems
      };
    });
  }

  function createApplicationSummaryModel(input, options) {
    const source = input || {};
    const parsed = source.parsed || {};
    const now = options && options.now ? options.now : new Date();
    const borrowerProfiles = Array.isArray(source.borrowerProfiles) ? source.borrowerProfiles : [];
    const profileNames = borrowerProfiles.map(function (profile) { return text(profile.name); }).filter(Boolean);
    let borrowers = [parsed.borrowerName, parsed.coBorrowerName].filter(Boolean);
    if (Array.isArray(parsed.borrowers) && parsed.borrowers.length) borrowers = parsed.borrowers;
    if (profileNames.length) borrowers = profileNames;
    borrowers = borrowers.map(text).filter(Boolean);
    const residences = normalizeHistory(source.residences, now);
    const employments = normalizeHistory(source.employments, now);
    const assets = Array.isArray(source.assets) ? source.assets : [];
    const liabilities = Array.isArray(source.liabilities) ? source.liabilities : [];
    const declarationSummaries = Array.isArray(source.declarationSummaries) ? source.declarationSummaries : [];
    const residenceCoverage = coverageByBorrower(residences, borrowers, { now });
    const employmentCoverage = coverageByBorrower(employments, borrowers, { now });
    const actionItems = []
      .concat(actionItemsForSummary(residenceCoverage, 'Residence', function (item) {
        return 'Add prior address history for ' + formatMonths(item.missingMonths) + ' to reach the required two years.';
      }))
      .concat(actionItemsForSummary(employmentCoverage, 'Employment', function (item) {
        return 'Add prior employment history for ' + formatMonths(item.missingMonths) + ' to reach the required two years.';
      }));

    return {
      parsed,
      borrowers,
      borrowerProfiles,
      assets,
      liabilities,
      declarationSummaries,
      borrowerPages: buildBorrowerPages(borrowers, borrowerProfiles, residences, employments, assets, liabilities, declarationSummaries, now),
      borrowerName: text(parsed.borrowerName),
      coBorrowerName: text(parsed.coBorrowerName),
      loanNumber: text(parsed.loanNumber),
      propertyAddress: text(parsed.propertyAddress),
      loanPurposeType: text(parsed.loanPurposeType),
      mortgageType: text(parsed.mortgageType),
      baseLoanAmount: formatCurrency(parsed.baseLoanAmount),
      noteRate: parsed.noteRate ? text(parsed.noteRate) + '%' : '',
      applicationDate: text(parsed.applicationDate),
      residences,
      employments,
      residenceCoverage,
      employmentCoverage,
      actionItems,
      generatedAt: now.toISOString()
    };
  }

  return {
    REQUIRED_MONTHS,
    createApplicationSummaryModel,
    durationMonths,
    monthsBetween,
    formatMonths,
    formatCurrency,
    statusLabel
  };
});
