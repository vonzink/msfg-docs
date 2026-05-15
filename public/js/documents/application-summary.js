(function () {
  'use strict';

  let currentModel = null;

  function esc(value) {
    if (window.MSFG && typeof MSFG.escHtml === 'function') return MSFG.escHtml(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function display(value) {
    return text(value) || 'Not provided';
  }

  function blankCell() {
    return { __appSummaryBlank: true };
  }

  function isBlankCell(value) {
    return value && typeof value === 'object' && value.__appSummaryBlank;
  }

  function localName(node) {
    return node ? (node.localName || String(node.nodeName || '').split(':').pop()) : '';
  }

  function attr(node, names) {
    if (!node) return '';
    const list = Array.isArray(names) ? names : [names];
    for (let i = 0; i < list.length; i++) {
      const value = node.getAttribute && node.getAttribute(list[i]);
      if (value) return value;
    }
    if (node.getAttributeNS) {
      const local = String(list[0] || '').split(':').pop();
      const value = node.getAttributeNS('http://www.w3.org/1999/xlink', local);
      if (value) return value;
    }
    return '';
  }

  function nodesByLocalName(root, name) {
    if (!root) return [];
    const nodes = root.getElementsByTagNameNS
      ? root.getElementsByTagNameNS('*', name)
      : root.getElementsByTagName(name);
    return nodes ? Array.from(nodes) : [];
  }

  function closestAncestorByLocalName(node, name) {
    let cur = node && node.parentNode;
    while (cur && cur.nodeType === 1) {
      if (localName(cur) === name) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function firstTextWithin(root, names) {
    const list = Array.isArray(names) ? names : [names];
    for (let i = 0; i < list.length; i++) {
      const found = nodesByLocalName(root, list[i]);
      for (let j = 0; j < found.length; j++) {
        const v = text(found[j].textContent);
        if (v && v.toLowerCase() !== 'na') return v;
      }
    }
    return '';
  }

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) {
      const v = text(arguments[i]);
      if (v) return v;
    }
    return '';
  }

  function parseXml(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    const errors = doc.getElementsByTagName('parsererror');
    if (errors && errors.length) throw new Error('Invalid XML');
    return doc;
  }

  function addressFrom(root) {
    const addr = root && (localName(root) === 'ADDRESS' ? root : nodesByLocalName(root, 'ADDRESS')[0]);
    if (!addr) return '';
    const line = firstTextWithin(addr, 'AddressLineText');
    const city = firstTextWithin(addr, 'CityName');
    const state = firstTextWithin(addr, 'StateCode');
    const postal = firstTextWithin(addr, 'PostalCode');
    return [line, city, state, postal].filter(Boolean).join(', ');
  }

  function partyName(party) {
    if (!party) return '';
    const first = firstTextWithin(party, 'FirstName');
    const middle = firstTextWithin(party, 'MiddleName');
    const last = firstTextWithin(party, 'LastName');
    const composed = [first, middle, last].filter(Boolean).join(' ');
    return firstNonEmpty(composed, firstTextWithin(party, 'FullName'), firstTextWithin(party, 'LegalEntityName'));
  }

  function borrowerParties(doc, parsed) {
    const out = [];
    const seen = new Set();
    nodesByLocalName(doc, 'PartyRoleType').forEach(function (node) {
      const role = closestAncestorByLocalName(node, 'ROLE');
      const borrowerNode = role ? nodesByLocalName(role, 'BORROWER')[0] : null;
      if (!borrowerNode) return;
      const roleType = text(node.textContent);
      const roleKey = roleType.toLowerCase();
      if (roleKey !== 'borrower' && roleKey !== 'cosigner') return;
      const party = closestAncestorByLocalName(node, 'PARTY') || closestAncestorByLocalName(node, 'Party');
      if (!party || seen.has(role)) return;
      seen.add(role);
      out.push({
        party,
        borrowerNode,
        roleNode: role,
        roleLabel: attr(role, ['xlink:label', 'label']),
        roleType,
        classification: role ? firstTextWithin(role, 'BorrowerClassificationType') : '',
        name: partyName(party)
      });
    });

    out.sort(function (a, b) {
      const av = text(a.roleType).toLowerCase() === 'borrower' ? 0 : 1;
      const bv = text(b.roleType).toLowerCase() === 'borrower' ? 0 : 1;
      return av - bv;
    });

    if (!out.length && parsed && parsed.borrowerName) {
      out.push({ party: doc, classification: 'Primary', name: parsed.borrowerName });
    }
    return out;
  }

  function phoneByRole(party, targetRole) {
    const target = text(targetRole).toLowerCase();
    const points = nodesByLocalName(party, 'CONTACT_POINT');
    for (let i = 0; i < points.length; i++) {
      const role = firstTextWithin(points[i], 'ContactPointRoleType').toLowerCase();
      if (role !== target) continue;
      const phone = firstTextWithin(points[i], 'ContactPointTelephoneValue');
      if (phone) return formatPhone(phone);
    }
    return '';
  }

  function formatPhone(value) {
    const digits = text(value).replace(/\D/g, '');
    if (digits.length === 10) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
    return text(value);
  }

  function maskTin(value) {
    const digits = text(value).replace(/\D/g, '');
    if (digits.length < 4) return '';
    return '***-**-' + digits.slice(-4);
  }

  function yesNo(value) {
    const v = text(value).toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return 'Yes';
    if (v === 'false' || v === '0' || v === 'no' || v === 'n') return 'No';
    return text(value);
  }

  function money(value) {
    return MSFG.ApplicationSummary.formatCurrency(value);
  }

  function moneyOrZero(value) {
    const raw = text(value);
    if (!raw) return '';
    const formatted = money(raw);
    if (formatted) return formatted;
    const n = parseFloat(raw.replace(/[$,%\s,]/g, ''));
    return Number.isFinite(n) && n === 0 ? '$0' : '';
  }

  function aliasNames(party) {
    return nodesByLocalName(party, 'ALIAS').map(function (alias) {
      return partyName(alias);
    }).filter(Boolean).join(', ');
  }

  function borrowerProfile(borrower) {
    const party = borrower.party;
    const borrowerNode = borrower.borrowerNode;
    const declaration = nodesByLocalName(borrowerNode, 'DECLARATION_DETAIL')[0] || borrowerNode;
    return {
      name: borrower.name,
      roleType: borrower.roleType,
      classification: borrower.classification,
      aliases: aliasNames(party),
      ssnLast4: maskTin(firstTextWithin(party, 'TaxpayerIdentifierValue')),
      birthDate: firstTextWithin(borrowerNode, 'BorrowerBirthDate'),
      age: firstTextWithin(borrowerNode, 'BorrowerAgeAtApplicationYearsCount'),
      citizenship: firstTextWithin(declaration, 'CitizenshipResidencyType'),
      maritalStatus: firstTextWithin(borrowerNode, 'MaritalStatusType'),
      dependents: firstTextWithin(borrowerNode, 'DependentCount'),
      homePhone: phoneByRole(party, 'Home'),
      cellPhone: phoneByRole(party, 'Mobile'),
      workPhone: phoneByRole(party, 'Work'),
      email: firstTextWithin(party, 'ContactPointEmailValue'),
      qualifyingIncome: money(firstNonEmpty(
        firstTextWithin(borrowerNode, 'BorrowerQualifyingIncomeAmount'),
        firstTextWithin(borrowerNode, 'CurrentIncomeMonthlyTotalAmount'),
        currentEmploymentIncome(borrowerNode)
      )),
      intentToOccupy: firstTextWithin(declaration, 'IntentToOccupyType'),
      homeownerPastThreeYears: firstTextWithin(declaration, 'HomeownerPastThreeYearsType')
    };
  }

  function currentEmploymentIncome(borrowerNode) {
    const employments = nodesByLocalName(borrowerNode, 'EMPLOYMENT');
    for (let i = 0; i < employments.length; i++) {
      if (employmentStatus(employments[i]).toLowerCase() !== 'current') continue;
      const income = firstTextWithin(employments[i], ['EmploymentMonthlyIncomeAmount', 'BaseIncomeAmount', 'IncomeAmount']);
      if (income) return income;
    }
    return '';
  }

  function durationTotalMonths(root, prefixes) {
    const totalNames = [];
    const yearNames = [];
    const monthNames = [];
    prefixes.forEach(function (prefix) {
      totalNames.push(prefix + 'DurationMonthsCount');
      totalNames.push(prefix + 'MonthsCount');
      yearNames.push(prefix + 'DurationYearsCount');
      monthNames.push(prefix + 'DurationRemainderMonthsCount');
      totalNames.push(prefix + 'TimeInLineOfWorkMonthsCount');
    });
    return {
      durationMonths: firstTextWithin(root, totalNames),
      years: firstTextWithin(root, yearNames),
      months: firstTextWithin(root, monthNames)
    };
  }

  function extractResidences(doc, parsed) {
    const rows = [];
    borrowerParties(doc, parsed).forEach(function (borrower) {
      nodesByLocalName(borrower.borrowerNode || borrower.party, 'RESIDENCE').forEach(function (residence) {
        const duration = durationTotalMonths(residence, ['BorrowerResidency', 'Residence', 'Residency']);
        rows.push({
          borrowerName: borrower.name,
          type: firstTextWithin(residence, ['BorrowerResidencyType', 'ResidencyType', 'ResidenceType']),
          address: addressFrom(residence),
          startDate: firstTextWithin(residence, ['BorrowerResidencyStartDate', 'ResidenceStartDate', 'ResidencyStartDate']),
          endDate: firstTextWithin(residence, ['BorrowerResidencyEndDate', 'ResidenceEndDate', 'ResidencyEndDate']),
          durationMonths: duration.durationMonths,
          years: duration.years,
          months: duration.months,
          housing: firstTextWithin(residence, ['ResidencyBasisType', 'HousingExpenseType'])
        });
      });
    });

    if (!rows.length && parsed) {
      if (parsed.currentResidenceAddress) {
        rows.push({ borrowerName: parsed.borrowerName, type: 'Current', address: parsed.currentResidenceAddress });
      }
      if (parsed.previousResidenceAddress) {
        rows.push({ borrowerName: parsed.borrowerName, type: 'Prior', address: parsed.previousResidenceAddress });
      }
    }
    return rows.filter(function (row) { return row.address || row.startDate || row.durationMonths || row.years || row.months; });
  }

  function employmentStatus(employment) {
    const status = firstTextWithin(employment, ['EmploymentStatusType', 'EmploymentClassificationType', 'EmploymentType']);
    if (status) return status;
    const current = firstTextWithin(employment, ['CurrentEmploymentIndicator', 'EmploymentCurrentIndicator']);
    if (/^(true|1|y|yes)$/i.test(current)) return 'Current';
    if (firstTextWithin(employment, ['EmploymentEndDate', 'EmploymentTerminationDate'])) return 'Previous';
    return '';
  }

  function employerName(employment) {
    const employer = closestAncestorByLocalName(employment, 'EMPLOYER') || employment;
    return firstNonEmpty(
      firstTextWithin(employer, ['EmployerName', 'EmploymentEmployerName']),
      firstTextWithin(employer, 'LegalEntityName'),
      firstTextWithin(employer, 'FullName')
    );
  }

  function extractEmployments(doc, parsed) {
    const rows = [];
    const seen = new Set();
    borrowerParties(doc, parsed).forEach(function (borrower) {
      nodesByLocalName(borrower.borrowerNode || borrower.party, 'EMPLOYMENT').forEach(function (employment) {
        if (seen.has(employment)) return;
        seen.add(employment);
        const employer = closestAncestorByLocalName(employment, 'EMPLOYER') || employment;
        const duration = durationTotalMonths(employment, ['Employment', 'TimeInLineOfWork']);
        const income = firstNonEmpty(
          firstTextWithin(employment, ['EmploymentMonthlyIncomeAmount', 'BaseIncomeAmount', 'IncomeAmount']),
          employmentStatus(employment).toLowerCase() === 'current' ? firstTextWithin(borrower.borrowerNode, 'CurrentIncomeMonthlyTotalAmount') : ''
        );
        rows.push({
          borrowerName: borrower.name,
          type: employmentStatus(employment),
          employerName: employerName(employment),
          title: firstTextWithin(employment, ['EmploymentPositionDescription', 'EmploymentPositionTitle', 'PositionDescription', 'PositionTitle']),
          address: addressFrom(employer),
          phone: formatPhone(firstTextWithin(employer, 'ContactPointTelephoneValue')),
          startDate: firstTextWithin(employment, ['EmploymentStartDate', 'StartDate']),
          endDate: firstTextWithin(employment, ['EmploymentEndDate', 'EmploymentTerminationDate', 'EndDate']),
          durationMonths: duration.durationMonths,
          years: duration.years,
          months: duration.months,
          monthlyIncome: income
        });
      });
    });

    if (!rows.length && parsed && parsed.selfEmployedBusinessName) {
      rows.push({
        borrowerName: parsed.borrowerName,
        type: 'Current',
        employerName: parsed.selfEmployedBusinessName,
        address: parsed.selfEmployedBusinessAddress,
        phone: parsed.selfEmployedBusinessPhone,
        startDate: parsed.selfEmployedStartDate,
        monthlyIncome: parsed.selfEmployedMonthlyIncome
      });
    }
    return rows.filter(function (row) { return row.employerName || row.startDate || row.durationMonths || row.years || row.months; });
  }

  function extractBorrowerProfiles(doc, parsed) {
    return borrowerParties(doc, parsed).map(borrowerProfile).filter(function (profile) {
      return profile.name;
    });
  }

  function roleToBorrowerMap(doc, parsed) {
    const out = {};
    borrowerParties(doc, parsed).forEach(function (borrower) {
      if (borrower.roleLabel && borrower.name) out[borrower.roleLabel] = borrower.name;
    });
    return out;
  }

  function relationshipBorrowerMap(doc, parsed, arcroleText) {
    const roleMap = roleToBorrowerMap(doc, parsed);
    const out = {};
    relationshipEndpoints(doc, arcroleText).forEach(function (relationship) {
      const borrowerName = roleMap[relationship.to];
      if (!borrowerName) return;
      out[relationship.from] = out[relationship.from] || [];
      if (out[relationship.from].indexOf(borrowerName) === -1) out[relationship.from].push(borrowerName);
    });
    return out;
  }

  function extractAssets(doc, parsed) {
    const borrowerMap = relationshipBorrowerMap(doc, parsed, 'ASSET_IsAssociatedWith_ROLE');
    return nodesByLocalName(doc, 'ASSET').map(function (asset) {
      const detail = nodesByLocalName(asset, 'ASSET_DETAIL')[0] || asset;
      const ownedProperty = nodesByLocalName(asset, 'OWNED_PROPERTY')[0] || asset;
      const ownedDetail = nodesByLocalName(ownedProperty, 'OWNED_PROPERTY_DETAIL')[0] || ownedProperty;
      const property = nodesByLocalName(ownedProperty, 'PROPERTY')[0] || ownedProperty;
      const type = firstTextWithin(detail, 'AssetType');
      const label = attr(asset, ['xlink:label', 'label']);
      const borrowerNames = label && borrowerMap[label] ? borrowerMap[label] : [];
      return {
        borrowerName: borrowerNames[0] || '',
        borrowerNames,
        type,
        holder: firstTextWithin(asset, 'FullName'),
        value: moneyOrZero(firstTextWithin(detail, 'AssetCashOrMarketValueAmount')),
        isReo: type.toLowerCase() === 'realestateowned' || Boolean(nodesByLocalName(asset, 'OWNED_PROPERTY').length),
        address: addressFrom(property),
        propertyValue: moneyOrZero(firstTextWithin(property, 'PropertyEstimatedValueAmount') || firstTextWithin(asset, 'PropertyEstimatedValueAmount')),
        usage: firstTextWithin(property, 'PropertyUsageType'),
        currentUsage: firstTextWithin(property, 'PropertyCurrentUsageType'),
        disposition: firstTextWithin(ownedDetail, 'OwnedPropertyDispositionStatusType'),
        lienUpb: moneyOrZero(firstTextWithin(ownedDetail, 'OwnedPropertyLienUPBAmount')),
        maintenanceExpense: moneyOrZero(firstTextWithin(ownedDetail, 'OwnedPropertyMaintenanceExpenseAmount')),
        netRentalIncome: moneyOrZero(firstTextWithin(ownedDetail, 'OwnedPropertyRentalIncomeNetAmount')),
        subjectIndicator: yesNo(firstTextWithin(ownedDetail, 'OwnedPropertySubjectIndicator'))
      };
    }).filter(function (asset) {
      return asset.type || asset.value || asset.propertyValue || asset.address;
    });
  }

  function relationshipEndpoints(doc, arcroleText) {
    return nodesByLocalName(doc, 'RELATIONSHIP').map(function (relationship) {
      return {
        arcrole: attr(relationship, ['xlink:arcrole', 'arcrole']),
        from: attr(relationship, ['xlink:from', 'from']),
        to: attr(relationship, ['xlink:to', 'to'])
      };
    }).filter(function (relationship) {
      return relationship.arcrole.indexOf(arcroleText) !== -1 && relationship.from && relationship.to;
    });
  }

  function liabilityBorrowerMap(doc, parsed) {
    return relationshipBorrowerMap(doc, parsed, 'LIABILITY_IsAssociatedWith_ROLE');
  }

  function extractLiabilities(doc, parsed) {
    const borrowerMap = liabilityBorrowerMap(doc, parsed);
    return nodesByLocalName(doc, 'LIABILITY').map(function (liability) {
      const detail = nodesByLocalName(liability, 'LIABILITY_DETAIL')[0] || liability;
      const account = firstTextWithin(detail, 'LiabilityAccountIdentifier');
      const label = attr(liability, ['xlink:label', 'label']);
      const borrowerNames = label && borrowerMap[label] ? borrowerMap[label] : [];
      return {
        borrowerName: borrowerNames[0] || '',
        borrowerNames,
        type: firstTextWithin(detail, 'LiabilityType'),
        creditor: firstTextWithin(liability, 'FullName'),
        account: account ? '...' + account.slice(-4) : '',
        balance: money(firstTextWithin(detail, 'LiabilityUnpaidBalanceAmount')),
        payment: money(firstTextWithin(detail, 'LiabilityMonthlyPaymentAmount')),
        paidOffAtClosing: yesNo(firstTextWithin(detail, 'LiabilityPayoffStatusIndicator')),
        excluded: yesNo(firstTextWithin(detail, 'LiabilityExclusionIndicator'))
      };
    }).filter(function (liability) {
      return liability.type || liability.creditor || liability.balance;
    });
  }

  function extractDeclarations(doc, parsed) {
    return borrowerParties(doc, parsed).map(function (borrower) {
      const detail = nodesByLocalName(borrower.borrowerNode, 'DECLARATION_DETAIL')[0] || borrower.borrowerNode;
      return {
        borrowerName: borrower.name,
        intentToOccupy: firstTextWithin(detail, 'IntentToOccupyType'),
        sellerRelationship: yesNo(firstTextWithin(detail, 'SpecialBorrowerSellerRelationshipIndicator')),
        undisclosedBorrowedFunds: yesNo(firstTextWithin(detail, 'UndisclosedBorrowedFundsIndicator')),
        undisclosedCredit: yesNo(firstTextWithin(detail, 'UndisclosedCreditApplicationIndicator')),
        undisclosedMortgage: yesNo(firstTextWithin(detail, 'UndisclosedMortgageApplicationIndicator')),
        judgments: yesNo(firstTextWithin(detail, 'OutstandingJudgmentsIndicator')),
        delinquentFederalDebt: yesNo(firstTextWithin(detail, 'PresentlyDelinquentIndicator')),
        lawsuit: yesNo(firstTextWithin(detail, 'PartyToLawsuitIndicator')),
        bankruptcy: yesNo(firstTextWithin(detail, 'BankruptcyIndicator') || firstTextWithin(borrower.borrowerNode, 'BorrowerBankruptcyIndicator')),
        foreclosure: yesNo(firstTextWithin(detail, 'PriorPropertyForeclosureCompletedIndicator')),
        shortSale: yesNo(firstTextWithin(detail, 'PriorPropertyShortSaleCompletedIndicator'))
      };
    }).filter(function (row) {
      return row.borrowerName;
    });
  }

  function loanFieldsFromXml(doc, parsed) {
    const subject = nodesByLocalName(doc, 'SUBJECT_PROPERTY')[0] || doc;
    const propertyDetail = nodesByLocalName(subject, 'PROPERTY_DETAIL')[0] || subject;
    return Object.assign({}, parsed || {}, {
      borrowers: borrowerParties(doc, parsed).map(function (b) { return b.name; }).filter(Boolean),
      purchasePriceAmount: firstTextWithin(doc, 'PurchasePriceAmount') || firstTextWithin(doc, 'SalesContractAmount'),
      propertyValueAmount: firstTextWithin(propertyDetail, 'PropertyEstimatedValueAmount'),
      occupancyType: firstTextWithin(propertyDetail, 'PropertyUsageType'),
      unitCount: firstTextWithin(propertyDetail, 'FinancedUnitCount'),
      totalMonthlyIncomeAmount: firstTextWithin(doc, 'TotalMonthlyIncomeAmount'),
      totalMonthlyProposedHousingExpenseAmount: firstTextWithin(doc, 'TotalMonthlyProposedHousingExpenseAmount')
    });
  }

  function buildModel(xmlString, parsed) {
    const doc = xmlString ? parseXml(xmlString) : null;
    const mergedParsed = doc ? loanFieldsFromXml(doc, parsed) : (parsed || {});
    const histories = doc ? {
      residences: extractResidences(doc, parsed),
      employments: extractEmployments(doc, parsed)
    } : { residences: [], employments: [] };

    return MSFG.ApplicationSummary.createApplicationSummaryModel({
      parsed: mergedParsed,
      borrowerProfiles: doc ? extractBorrowerProfiles(doc, parsed) : [],
      residences: histories.residences,
      employments: histories.employments,
      assets: doc ? extractAssets(doc, parsed) : [],
      liabilities: doc ? extractLiabilities(doc, parsed) : [],
      declarationSummaries: doc ? extractDeclarations(doc, parsed) : []
    });
  }

  function setSource(title, meta) {
    const titleEl = document.getElementById('applicationSummarySourceTitle');
    const metaEl = document.getElementById('applicationSummarySourceMeta');
    if (titleEl) titleEl.textContent = title;
    if (metaEl) metaEl.textContent = meta;
  }

  function setStatusCard(area, label, status) {
    const card = document.querySelector('[data-status-area="' + area + '"]');
    if (!card) return;
    const strong = card.querySelector('strong');
    if (strong) strong.textContent = label;
    card.classList.toggle('is-complete', status === 'complete');
    card.classList.toggle('is-review', status === 'needs-review');
  }

  function updateStatusCards(model) {
    setStatusCard('residence',
      MSFG.ApplicationSummary.statusLabel(model.residenceCoverage) + ' - ' + MSFG.ApplicationSummary.formatMonths(model.residenceCoverage.coveredMonths),
      model.residenceCoverage.status);
    setStatusCard('employment',
      MSFG.ApplicationSummary.statusLabel(model.employmentCoverage) + ' - ' + MSFG.ApplicationSummary.formatMonths(model.employmentCoverage.coveredMonths),
      model.employmentCoverage.status);
    setStatusCard('actions',
      model.actionItems.length ? model.actionItems.length + ' needs review' : 'Ready',
      model.actionItems.length ? 'needs-review' : 'complete');
  }

  function rowsTable(headers, rows, emptyText, tableClass) {
    if (!rows.length) return '<p class="text-muted">' + esc(emptyText) + '</p>';
    let html = '<table class="app-summary-table' + (tableClass ? ' ' + esc(tableClass) : '') + '"><thead><tr>';
    headers.forEach(function (head) { html += '<th>' + esc(head) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      row.forEach(function (cell) { html += '<td>' + cellHtml(cell) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function cellHtml(value) {
    if (isBlankCell(value)) return '';
    const rendered = display(value);
    if (rendered === 'Not provided') return '<span class="app-summary-missing">Not provided</span>';
    return esc(rendered);
  }

  function pairRows(rows) {
    const pairs = [];
    for (let i = 0; i < rows.length; i += 2) {
      const left = rows[i] || ['', ''];
      const right = rows[i + 1] || [blankCell(), blankCell()];
      pairs.push([left[0], left[1], right[0], right[1]]);
    }
    return pairs;
  }

  function loanRows(model) {
    const parsed = model.parsed || {};
    return [
      ['Borrower(s)', model.borrowers.join(', ')],
      ['Subject property', model.propertyAddress],
      ['Occupancy', parsed.occupancyType],
      ['Units', parsed.unitCount],
      ['Loan purpose', model.loanPurposeType],
      ['Mortgage type', model.mortgageType],
      ['Loan amount', model.baseLoanAmount],
      ['Purchase price', money(parsed.purchasePriceAmount)],
      ['Property value', money(parsed.propertyValueAmount)]
    ];
  }

  function fallbackBorrowerProfile(model) {
    const parsed = model.parsed || {};
    return {
      name: parsed.borrowerName || model.borrowerName,
      roleType: 'Borrower',
      ssnLast4: maskTin(parsed.borrowerTin),
      birthDate: parsed.borrowerBirthDate,
      citizenship: '',
      maritalStatus: '',
      dependents: '',
      homePhone: parsed.borrowerPhone,
      cellPhone: '',
      workPhone: parsed.coBorrowerPhone,
      email: parsed.borrowerEmail,
      aliases: ''
    };
  }

  function borrowerProfileRows(profile) {
    if (!profile || !profile.name) return [];
    return [[
      profile.name,
      profile.roleType,
      profile.ssnLast4,
      profile.birthDate,
      profile.citizenship,
      profile.maritalStatus,
      profile.dependents,
      [profile.homePhone, profile.cellPhone, profile.workPhone].filter(Boolean).join(' / '),
      profile.email,
      profile.aliases
    ]];
  }

  function assetRows(model) {
    return model.assets.filter(function (asset) {
      return !asset.isReo;
    }).map(function (asset) {
      return [asset.type, asset.holder, asset.value || asset.propertyValue, asset.usage, asset.disposition];
    });
  }

  function reoRows(model) {
    const reoProperties = model.reoProperties || (model.assets || []).filter(function (asset) { return asset.isReo; });
    return reoProperties.map(function (asset) {
      return [
        asset.address,
        asset.currentUsage || asset.usage,
        asset.propertyValue,
        asset.lienUpb,
        asset.netRentalIncome,
        asset.maintenanceExpense,
        asset.disposition
      ];
    });
  }

  function liabilityRows(model) {
    return model.liabilities.map(function (liability) {
      return [
        liability.type,
        liability.creditor,
        liability.account,
        liability.balance,
        liability.payment,
        liability.paidOffAtClosing,
        liability.excluded
      ];
    });
  }

  function historyStatusText(summary) {
    if (summary.status === 'complete') {
      return 'Complete - ' + MSFG.ApplicationSummary.formatMonths(summary.coveredMonths) + ' listed';
    }
    return 'Needs review - missing ' + MSFG.ApplicationSummary.formatMonths(summary.missingMonths);
  }

  function actionItemsHtml(page) {
    if (!page.actionItems || !page.actionItems.length) {
      return '<li>No two-year employment or residence gaps found for this borrower from the MISMO data.</li>';
    }
    return page.actionItems.map(function (item) {
      return '<li><strong>' + esc(item.area) + ':</strong> ' + esc(item.message) + '</li>';
    }).join('');
  }

  function borrowerPageHtml(model, page, idx, total) {
    function endDateFor(row) {
      return text(row.type).toLowerCase().indexOf('current') !== -1 ? blankCell() : row.endDate;
    }

    const residenceRows = page.residences.map(function (row) {
      return [row.type, row.address, row.durationLabel, row.startDate, endDateFor(row)];
    });
    const employmentRows = page.employments.map(function (row) {
      return [row.type, row.employerName, row.title, row.durationLabel, row.startDate, endDateFor(row), row.monthlyIncome ? MSFG.ApplicationSummary.formatCurrency(row.monthlyIncome) : ''];
    });
    const declarationRowsForPage = page.declarationSummaries.map(function (row) {
      return [
        row.intentToOccupy,
        row.sellerRelationship,
        row.undisclosedBorrowedFunds,
        row.undisclosedCredit,
        row.undisclosedMortgage,
        row.judgments,
        row.delinquentFederalDebt,
        row.lawsuit,
        row.bankruptcy,
        row.foreclosure,
        row.shortSale
      ];
    });
    const assetsForPage = Object.prototype.hasOwnProperty.call(page, 'assets') ? page.assets : model.assets;
    const reoRowsForPage = reoRows({
      assets: assetsForPage,
      reoProperties: Object.prototype.hasOwnProperty.call(page, 'reoProperties') ? page.reoProperties : undefined
    });
    const liabilitiesForPage = Object.prototype.hasOwnProperty.call(page, 'liabilities') ? page.liabilities : model.liabilities;
    const reoSection = reoRowsForPage.length
      ? '<div class="app-summary-section">' +
          '<h4>Real estate owned</h4>' +
          rowsTable(['Address', 'Usage', 'Value', 'Lien UPB', 'Net rental', 'Maintenance', 'Disposition'], reoRowsForPage, 'No real estate owned data was found in the MISMO data for this borrower.') +
        '</div>'
      : '';

    return '<div class="app-summary-packet app-summary-page">' +
      '<div class="app-summary-packet__header">' +
        '<div>' +
          '<div class="app-summary-packet__eyebrow">Borrower Review - URLA ' + esc(idx + 1) + ' of ' + esc(total) + '</div>' +
          '<h3>Application Summary</h3>' +
          '<p>' + esc(display(page.borrowerName)) + '</p>' +
        '</div>' +
        '<div class="app-summary-packet__date">' + esc(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })) + '</div>' +
      '</div>' +
      '<div class="app-summary-kpis">' +
        '<div class="app-summary-kpi ' + (page.residenceCoverage.status === 'complete' ? 'is-complete' : 'is-review') + '">' +
          '<span>Residence coverage</span><strong>' + esc(historyStatusText(page.residenceCoverage)) + '</strong>' +
        '</div>' +
        '<div class="app-summary-kpi ' + (page.employmentCoverage.status === 'complete' ? 'is-complete' : 'is-review') + '">' +
          '<span>Employment coverage</span><strong>' + esc(historyStatusText(page.employmentCoverage)) + '</strong>' +
        '</div>' +
        '<div class="app-summary-kpi ' + (page.actionItems.length ? 'is-review' : 'is-complete') + '">' +
          '<span>Review items</span><strong>' + esc(page.actionItems.length ? page.actionItems.length + ' item(s)' : 'None') + '</strong>' +
        '</div>' +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Items to confirm before submission</h4>' +
        '<ul class="app-summary-actions-list ' + (page.actionItems.length ? '' : 'is-clean') + '">' + actionItemsHtml(page) + '</ul>' +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Loan overview</h4>' +
        rowsTable(['Field', 'Value', 'Field', 'Value'], pairRows(loanRows(model)), 'No loan overview fields were found.', 'app-summary-table--pair') +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Borrower information</h4>' +
        rowsTable(['Name', 'Role', 'SSN/ITIN', 'DOB', 'Citizenship', 'Marital', 'Dependents', 'Phones', 'Email', 'AKA'], borrowerProfileRows(page.borrowerProfile), 'No borrower contact fields were found.') +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Residence history</h4>' +
        rowsTable(['Type', 'Address', 'Duration', 'Start', 'End'], residenceRows, 'No residence history was found in the MISMO data for this borrower.') +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Employment history</h4>' +
        rowsTable(['Type', 'Employer', 'Title', 'Duration', 'Start', 'End', 'Monthly income'], employmentRows, 'No employment history was found in the MISMO data for this borrower.') +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Financial assets</h4>' +
        rowsTable(['Type', 'Institution / account', 'Value', 'Usage', 'Disposition'], assetRows({ assets: assetsForPage }), 'No cash or financial asset data was found in the MISMO data for this borrower.') +
      '</div>' +
      reoSection +
      '<div class="app-summary-section">' +
        '<h4>Liabilities</h4>' +
        rowsTable(['Type', 'Creditor', 'Account', 'Balance', 'Payment', 'Paid off at closing', 'Excluded'], liabilityRows({ liabilities: liabilitiesForPage }), 'No liability data was found in the MISMO data for this borrower.') +
      '</div>' +
      '<div class="app-summary-section">' +
        '<h4>Declarations to confirm</h4>' +
        rowsTable(['Occupy', 'Seller relationship', 'Borrowed funds', 'New credit', 'Other mortgage', 'Judgments', 'Federal debt delinquent', 'Lawsuit', 'Bankruptcy', 'Foreclosure', 'Short sale'], declarationRowsForPage, 'No declaration data was found in the MISMO data for this borrower.') +
      '</div>' +
      '<p class="app-summary-disclaimer">Application information will be verified and may be updated during the loan process.</p>' +
    '</div>';
  }

  function renderModel(model) {
    const preview = document.getElementById('applicationSummaryPreview');
    if (!preview) return;
    updateStatusCards(model);

    const pages = (model.borrowerPages && model.borrowerPages.length)
      ? model.borrowerPages
      : [{
        borrowerName: model.borrowerName,
        borrowerProfile: fallbackBorrowerProfile(model),
        residences: model.residences,
        employments: model.employments,
        assets: model.assets,
        reoProperties: model.assets.filter(function (asset) { return asset.isReo; }),
        liabilities: model.liabilities,
        declarationSummaries: model.declarationSummaries,
        residenceCoverage: model.residenceCoverage,
        employmentCoverage: model.employmentCoverage,
        actionItems: model.actionItems
      }];

    preview.innerHTML = pages.map(function (page, idx) {
      return borrowerPageHtml(model, page, idx, pages.length);
    }).join('');
  }

  function renderEmpty() {
    currentModel = null;
    setSource('No MISMO loaded', 'Open this document in Workspace after importing MISMO, or upload XML here.');
    setStatusCard('residence', 'Needs MISMO', '');
    setStatusCard('employment', 'Needs MISMO', '');
    setStatusCard('actions', '--', '');
    const preview = document.getElementById('applicationSummaryPreview');
    if (preview) {
      preview.innerHTML = '<div class="app-summary-empty"><h3>Application Summary</h3><p>Import MISMO XML to build the borrower review packet.</p></div>';
    }
  }

  function applyPayload(payload, label) {
    const xmlString = payload && payload.xmlString ? String(payload.xmlString) : '';
    const parsed = payload && payload.parsed ? payload.parsed : (xmlString && MSFG.MISMO ? MSFG.MISMO.parseXml(xmlString) : {});
    currentModel = buildModel(xmlString, parsed || {});
    setSource(currentModel.borrowers.length ? currentModel.borrowers.join(', ') : 'MISMO loaded', label || 'Loaded');
    renderModel(currentModel);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read MISMO file')); };
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.readAsText(file);
    });
  }

  function buildEmailData() {
    if (!currentModel) {
      return {
        title: 'Application Summary',
        sections: [{ heading: 'Summary', rows: [{ label: 'Status', value: 'No MISMO loaded' }] }]
      };
    }
    const pages = (currentModel.borrowerPages && currentModel.borrowerPages.length)
      ? currentModel.borrowerPages
      : [{
        borrowerName: currentModel.borrowerName,
        borrowerProfile: fallbackBorrowerProfile(currentModel),
        residences: currentModel.residences,
        employments: currentModel.employments,
        assets: currentModel.assets,
        reoProperties: currentModel.assets.filter(function (asset) { return asset.isReo; }),
        liabilities: currentModel.liabilities,
        declarationSummaries: currentModel.declarationSummaries,
        residenceCoverage: currentModel.residenceCoverage,
        employmentCoverage: currentModel.employmentCoverage,
        actionItems: currentModel.actionItems
      }];
    const sections = [
      {
        heading: 'Coverage',
        rows: [
          { label: 'Residence history', value: historyStatusText(currentModel.residenceCoverage) },
          { label: 'Employment history', value: historyStatusText(currentModel.employmentCoverage) },
          { label: 'Review items', value: currentModel.actionItems.length ? currentModel.actionItems.map(function (i) {
            return i.area + (i.borrowerName ? ' - ' + i.borrowerName : '') + ': ' + i.message;
          }).join('\n') : 'None' }
        ]
      },
      { heading: 'Loan overview', rows: loanRows(currentModel).map(function (row) { return { label: row[0], value: row[1] }; }) }
    ];

    pages.forEach(function (page, idx) {
      const profileRow = borrowerProfileRows(page.borrowerProfile)[0] || [];
      sections.push({
        heading: 'Application ' + (idx + 1) + ' of ' + pages.length + ' - ' + page.borrowerName,
        variant: 'application-divider',
        rows: [
          { label: 'Borrower', value: profileRow.filter(Boolean).join(' | ') },
          { label: 'Residence history', value: historyStatusText(page.residenceCoverage) },
          { label: 'Employment history', value: historyStatusText(page.employmentCoverage) },
          { label: 'Review items', value: page.actionItems.length ? page.actionItems.map(function (item) { return item.area + ': ' + item.message; }).join('\n') : 'None' }
        ]
      });
      sections.push({
        heading: 'Residence history - ' + page.borrowerName,
        rows: page.residences.map(function (row) {
          return { label: [row.type, row.durationLabel].filter(Boolean).join(' - '), value: row.address };
        })
      });
      sections.push({
        heading: 'Employment history - ' + page.borrowerName,
        rows: page.employments.map(function (row) {
          return { label: [row.type, row.durationLabel].filter(Boolean).join(' - '), value: [row.employerName, row.title].filter(Boolean).join(' - ') };
        })
      });
      sections.push({
        heading: 'Financial assets - ' + page.borrowerName,
        rows: assetRows({ assets: page.assets || [] }).map(function (row) {
          return { label: [row[0], row[1]].filter(Boolean).join(' - '), value: row.slice(2).filter(Boolean).join(' | ') };
        })
      });
      if (page.reoProperties && page.reoProperties.length) {
        sections.push({
          heading: 'Real estate owned - ' + page.borrowerName,
          rows: reoRows({ reoProperties: page.reoProperties }).map(function (row) {
            return { label: [row[0], row[1]].filter(Boolean).join(' - '), value: row.slice(2).filter(Boolean).join(' | ') };
          })
        });
      }
      sections.push({
        heading: 'Liabilities - ' + page.borrowerName,
        rows: liabilityRows({ liabilities: page.liabilities || [] }).map(function (row) {
          return { label: [row[0], row[1], row[2]].filter(Boolean).join(' - '), value: row.slice(3).filter(Boolean).join(' | ') };
        })
      });
    });

    return { title: 'Application Summary', sections };
  }

  function captureForReport() {
    const data = buildEmailData();
    return MSFG.fetch(MSFG.apiUrl('/api/pdf/structured'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
      return resp.arrayBuffer();
    }).then(function (buf) {
      return {
        pdfBytes: new Uint8Array(buf),
        name: 'Application Summary',
        icon: 'AS',
        slug: 'application-summary',
        data,
        filename: 'application-summary.pdf'
      };
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderEmpty();

    const fileInput = document.getElementById('applicationSummaryFile');
    const clearBtn = document.getElementById('applicationSummaryClear');

    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          setSource(file.name, 'Reading...');
          const xmlString = await readFile(file);
          const parsed = MSFG.MISMO.parseXml(xmlString);
          applyPayload({ xmlString, parsed }, file.name + ' - ' + Math.round(file.size / 1024) + ' KB');
        } catch (err) {
          console.error('[Application Summary] MISMO load failed:', err);
          setSource('Could not load MISMO', err.message || 'Invalid XML');
        } finally {
          fileInput.value = '';
        }
      });
    }

    if (clearBtn) clearBtn.addEventListener('click', renderEmpty);

    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_MISMO') return;
      if (!e.data.payload || !e.data.payload.parsed) return;
      applyPayload(e.data.payload, 'Loaded from Workspace');
    });

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
      }
    } catch (_e) { /* ignore */ }

    if (window.MSFG && MSFG.DocActions) {
      MSFG.DocActions.register(buildEmailData);
      MSFG.DocActions.registerCapture(captureForReport);
    }
    if (window.MSFG && MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('application-summary', buildEmailData);
    }
  });
})();
