/* =====================================================
   MISMO XML Parser (lightweight)
   Extracts common fields for document auto-fill
   ===================================================== */
'use strict';

(function() {
  const MSFG = window.MSFG || (window.MSFG = {});

  function nodesByLocalName(root, localName) {
    if (!root) return [];
    const nodes = root.getElementsByTagNameNS
      ? root.getElementsByTagNameNS('*', localName)
      : root.getElementsByTagName(localName);
    return nodes ? Array.from(nodes) : [];
  }

  function textByLocalName(root, localName) {
    if (!root) return '';
    const nodes = nodesByLocalName(root, localName);
    if (!nodes.length) return '';
    for (let i = 0; i < nodes.length; i++) {
      const t = (nodes[i].textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  function allTextByLocalName(root, localName) {
    const out = [];
    if (!root) return out;
    const nodes = nodesByLocalName(root, localName);
    if (!nodes.length) return out;
    for (let i = 0; i < nodes.length; i++) {
      const t = (nodes[i].textContent || '').trim();
      if (t) out.push(t);
    }
    return out;
  }

  function closestAncestorByLocalName(node, localName) {
    let cur = node && node.parentNode;
    while (cur && cur.nodeType === 1) {
      if ((cur.localName || cur.nodeName) === localName) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function firstTextWithin(node, localName) {
    return textByLocalName(node, localName);
  }

  function getBorrowerFullName(doc) {
    // Prefer PARTY where PartyRoleType == Borrower (MISMO 3.4 closing exports)
    const roleTypeNodes = nodesByLocalName(doc, 'PartyRoleType');
    for (const n of roleTypeNodes) {
      const t = (n.textContent || '').trim();
      if (!t || t.toLowerCase() !== 'borrower') continue;

      const party = closestAncestorByLocalName(n, 'PARTY') || closestAncestorByLocalName(n, 'Party');
      if (!party) continue;

      const full = firstTextWithin(party, 'FullName');
      if (full) return full;

      const first = firstTextWithin(party, 'FirstName');
      const last = firstTextWithin(party, 'LastName');
      const composed = [first, last].filter(Boolean).join(' ').trim();
      if (composed) return composed;
    }

    // Fallback: look for any FirstName/LastName pair that appears to be a borrower
    const first = textByLocalName(doc, 'FirstName');
    const last = textByLocalName(doc, 'LastName');
    const composed = [first, last].filter(Boolean).join(' ').trim();
    if (composed && composed.toLowerCase() !== 'na') return composed;

    return '';
  }

  function getBorrowers(doc) {
    const candidates = [];

    // For MISMO 3.4 closing exports, each borrower PARTY contains ROLE_DETAIL/PartyRoleType=Borrower
    // and BORROWER_DETAIL/BorrowerClassificationType (Primary/Secondary).
    const roleTypeNodes = nodesByLocalName(doc, 'PartyRoleType');
    for (const n of roleTypeNodes) {
      const t = (n.textContent || '').trim();
      if (!t || t.toLowerCase() !== 'borrower') continue;

      const role = closestAncestorByLocalName(n, 'ROLE');
      const party = closestAncestorByLocalName(n, 'PARTY');
      if (!party) continue;

      // classification is usually on the ROLE (BORROWER_DETAIL)
      let classification = '';
      if (role) {
        classification = firstTextWithin(role, 'BorrowerClassificationType');
      }

      let name = '';
      const first = firstTextWithin(party, 'FirstName');
      const last = firstTextWithin(party, 'LastName');
      const composed = [first, last].filter(Boolean).join(' ').trim();
      if (composed && composed.toLowerCase() !== 'na') name = composed;
      if (!name) {
        const full = firstTextWithin(party, 'FullName');
        if (full && full.toLowerCase() !== 'na') name = full;
      }
      if (!name) continue;

      candidates.push({ name, classification: (classification || '').trim() });
    }

    // Dedupe while preserving order
    const seen = new Set();
    const deduped = candidates.filter(c => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const primary = deduped.find(c => c.classification.toLowerCase() === 'primary');
    const secondary = deduped.find(c => c.classification.toLowerCase() === 'secondary');

    const ordered = [];
    if (primary) ordered.push(primary.name);
    if (secondary) ordered.push(secondary.name);

    // If classification is missing or odd, fall back to first two unique
    if (!ordered.length) {
      deduped.slice(0, 2).forEach(c => ordered.push(c.name));
    } else if (ordered.length === 1) {
      // add next best distinct candidate
      const next = deduped.find(c => c.name !== ordered[0]);
      if (next) ordered.push(next.name);
    }

    // Final fallback
    if (!ordered.length) {
      const one = getBorrowerFullName(doc);
      if (one) ordered.push(one);
    }

    return ordered;
  }

  function isUuidLike(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '').trim());
  }

  function getLoanNumber(doc) {
    const blocks = nodesByLocalName(doc, 'LOAN_IDENTIFIER');
    if (blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const type = (firstTextWithin(b, 'LoanIdentifierType') || '').trim();
        const id = (firstTextWithin(b, 'LoanIdentifier') || '').trim();
        const t = type.toLowerCase();
        if (t === 'lenderloan' && id) return id;
      }
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const type = (firstTextWithin(b, 'LoanIdentifierType') || '').trim();
        const id = (firstTextWithin(b, 'LoanIdentifier') || '').trim();
        const otherDesc = (firstTextWithin(b, 'LoanIdentifierTypeOtherDescription') || '').trim().toLowerCase();
        if (!id || isUuidLike(id)) continue;
        const t = type.toLowerCase();
        if (t === 'other' && otherDesc === 'lendingpadloannumber') return id;
        if (t === 'other' && otherDesc.includes('loannumber') && !otherDesc.includes('unique')) return id;
      }
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const type = (firstTextWithin(b, 'LoanIdentifierType') || '').trim();
        const id = (firstTextWithin(b, 'LoanIdentifier') || '').trim();
        const otherDesc = (firstTextWithin(b, 'LoanIdentifierTypeOtherDescription') || '').trim().toLowerCase();
        if (!id || isUuidLike(id)) continue;
        const t = type.toLowerCase();
        if (t === 'other' && (otherDesc.includes('unique') || otherDesc === 'referencenumber')) continue;
        if (t === 'mers_min') continue;
        return id;
      }
    }
    const los = (textByLocalName(doc, 'LoanOriginationSystemLoanIdentifier') || '').trim();
    if (los && !isUuidLike(los)) return los;
    const fallback = (textByLocalName(doc, 'LoanIdentifier') || '').trim();
    if (fallback && !isUuidLike(fallback)) return fallback;
    return '';
  }

  function getSubjectPropertyAddress(doc) {
    // Prefer SUBJECT_PROPERTY/ADDRESS in closing XML
    const subjectProps = nodesByLocalName(doc, 'SUBJECT_PROPERTY');
    if (subjectProps.length) {
      const sp = subjectProps[0];
      const addr = nodesByLocalName(sp, 'ADDRESS')[0];
      if (addr) {
        const addrLine = firstTextWithin(addr, 'AddressLineText');
        const city = firstTextWithin(addr, 'CityName');
        const state = firstTextWithin(addr, 'StateCode');
        const postal = firstTextWithin(addr, 'PostalCode');
        return [addrLine, city, state, postal].filter(Boolean).join(', ').replace(', ,', ',');
      }
    }

    // Fallback: first address-like fields found anywhere
    const addrLine = textByLocalName(doc, 'AddressLineText');
    const city = textByLocalName(doc, 'CityName');
    const state = textByLocalName(doc, 'StateCode');
    const postal = textByLocalName(doc, 'PostalCode');
    return [addrLine, city, state, postal].filter(Boolean).join(', ').replace(', ,', ',');
  }

  function getCurrentResidenceAddress(doc) {
    const parts = getCurrentResidenceAddressParts(doc);
    const composed = [parts.line, parts.city, parts.state, parts.postal].filter(Boolean).join(', ').replace(', ,', ',');
    return composed;
  }

  /** Structured current residence (BorrowerResidencyType Current) for forms like 4506-C. */
  function getCurrentResidenceAddressParts(doc) {
    const residencyTypeNodes = nodesByLocalName(doc, 'BorrowerResidencyType');
    for (const n of residencyTypeNodes) {
      const t = (n.textContent || '').trim();
      if (!t || t.toLowerCase() !== 'current') continue;
      const residence = closestAncestorByLocalName(n, 'RESIDENCE');
      if (!residence) continue;
      const addr = nodesByLocalName(residence, 'ADDRESS')[0];
      if (!addr) continue;
      return {
        line: (firstTextWithin(addr, 'AddressLineText') || '').trim(),
        city: (firstTextWithin(addr, 'CityName') || '').trim(),
        state: (firstTextWithin(addr, 'StateCode') || '').trim(),
        postal: (firstTextWithin(addr, 'PostalCode') || '').trim()
      };
    }
    return { line: '', city: '', state: '', postal: '' };
  }

  /** Prior residence (BorrowerResidencyType Prior) — common on URLA / MISMO exports. */
  function getPriorResidenceAddressParts(doc) {
    const residencyTypeNodes = nodesByLocalName(doc, 'BorrowerResidencyType');
    for (const n of residencyTypeNodes) {
      const t = (n.textContent || '').trim();
      if (!t || t.toLowerCase() !== 'prior') continue;
      const residence = closestAncestorByLocalName(n, 'RESIDENCE');
      if (!residence) continue;
      const addr = nodesByLocalName(residence, 'ADDRESS')[0];
      if (!addr) continue;
      return {
        line: (firstTextWithin(addr, 'AddressLineText') || '').trim(),
        city: (firstTextWithin(addr, 'CityName') || '').trim(),
        state: (firstTextWithin(addr, 'StateCode') || '').trim(),
        postal: (firstTextWithin(addr, 'PostalCode') || '').trim()
      };
    }
    return { line: '', city: '', state: '', postal: '' };
  }

  function composeAddressParts(parts) {
    return [parts.line, parts.city, parts.state, parts.postal].filter(Boolean).join(', ').replace(', ,', ',');
  }

  function normalizeSsnLike(s) {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length !== 9) return '';
    return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
  }

  /** Best-effort SSN/ITIN values from TaxpayerIdentifierValue (primary first, then spouse). */
  function getTaxpayerIdentifierList(doc) {
    const raw = allTextByLocalName(doc, 'TaxpayerIdentifierValue');
    const out = [];
    const seen = new Set();
    for (let i = 0; i < raw.length; i++) {
      const n = normalizeSsnLike(raw[i]);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }

  /* ---- Generic PARTY-by-role lookups ----
     MISMO 3.4 closing exports use a uniform pattern: every actor (lender,
     title vendor, buyer's agent, seller's agent) is a PARTY whose
     PartyRoleType identifies their role. Once we find the PARTY element,
     name/address/contact/license live in predictable child elements. */

  function findPartiesByRole(doc, roleType) {
    const out = [];
    const roleTypeNodes = nodesByLocalName(doc, 'PartyRoleType');
    const target = String(roleType || '').trim().toLowerCase();
    for (const n of roleTypeNodes) {
      const t = (n.textContent || '').trim();
      if (!t || t.toLowerCase() !== target) continue;
      const party = closestAncestorByLocalName(n, 'PARTY') || closestAncestorByLocalName(n, 'Party');
      if (party && out.indexOf(party) === -1) out.push(party);
    }
    return out;
  }

  function findPartyByRole(doc, roleType) {
    return findPartiesByRole(doc, roleType)[0] || null;
  }

  /** Pick the first non-empty trimmed value from a list. */
  function firstNonEmpty(/* ...vals */) {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return '';
  }

  /** Extract person/company name + address + contact info from a PARTY element.
   *  Handles both INDIVIDUAL (NAME/FirstName/LastName/FullName) and LEGAL_ENTITY
   *  (LegalEntityName / FullName). Companies usually publish under LEGAL_ENTITY. */
  function getPartyInfo(party) {
    const blank = {
      name: '', firstName: '', middleName: '', lastName: '',
      addressLine: '', city: '', state: '', postal: '', fullAddress: '',
      phone: '', email: '', license: ''
    };
    if (!party) return blank;

    const first = firstTextWithin(party, 'FirstName');
    const middle = firstTextWithin(party, 'MiddleName');
    const last = firstTextWithin(party, 'LastName');
    const composed = [first, middle, last].filter(Boolean).join(' ').trim();
    const fullName = firstTextWithin(party, 'FullName');
    const legalName = firstTextWithin(party, 'LegalEntityName');

    const name = firstNonEmpty(
      composed.toLowerCase() === 'na' ? '' : composed,
      fullName && fullName.toLowerCase() !== 'na' ? fullName : '',
      legalName
    );

    // First ADDRESS encountered on the PARTY (some MISMO exports nest under
    // ADDRESSES > ADDRESS; getElementsByTagName grabs at any depth).
    const addr = nodesByLocalName(party, 'ADDRESS')[0];
    const addressLine = addr ? firstTextWithin(addr, 'AddressLineText') : '';
    const city = addr ? firstTextWithin(addr, 'CityName') : '';
    const state = addr ? firstTextWithin(addr, 'StateCode') : '';
    const postal = addr ? firstTextWithin(addr, 'PostalCode') : '';
    const fullAddress = [addressLine, city, state, postal].filter(Boolean).join(', ');

    const phone = firstTextWithin(party, 'ContactPointTelephoneValue');
    const email = firstTextWithin(party, 'ContactPointEmailValue');
    const license = firstTextWithin(party, 'LicenseIdentifier');

    return {
      name,
      firstName: first,
      middleName: middle,
      lastName: last,
      addressLine,
      city,
      state,
      postal,
      fullAddress,
      phone,
      email,
      license
    };
  }

  /** Extract loan-level dates and identifiers that aren't already in the
   *  borrower / property helpers. */
  function getLoanDetails(doc) {
    return {
      closingDate: textByLocalName(doc, 'ClosingDate'),
      disbursementDate: textByLocalName(doc, 'DisbursementDate'),
      loanMaturityDate: textByLocalName(doc, 'LoanMaturityDate'),
      // Application & estimate dates seen across MISMO 3.4 closings.
      applicationDate: textByLocalName(doc, 'ApplicationReceivedDate') || textByLocalName(doc, 'LoanApplicationDate'),
      estimatedClosingDate: textByLocalName(doc, 'EstimatedClosingDate')
    };
  }

  /** Borrower-specific contact info beyond the name/SSN already extracted.
   *  Looks at the PARTY containing PartyRoleType=Borrower with primary
   *  classification. */
  function getBorrowerContact(doc, classification /* 'primary' | 'secondary' */) {
    const target = String(classification || '').toLowerCase();
    const roleTypeNodes = nodesByLocalName(doc, 'PartyRoleType');
    for (const n of roleTypeNodes) {
      const t = (n.textContent || '').trim();
      if (!t || t.toLowerCase() !== 'borrower') continue;
      const role = closestAncestorByLocalName(n, 'ROLE');
      const party = closestAncestorByLocalName(n, 'PARTY');
      if (!party) continue;
      const cls = role ? (firstTextWithin(role, 'BorrowerClassificationType') || '').trim().toLowerCase() : '';
      if (target && cls !== target) continue;
      return getPartyInfo(party);
    }
    return getPartyInfo(null);
  }

  /** Borrower self-employment info — for the Income Statement and
   *  Balance Sheet docs. Looks for an EMPLOYMENT block whose
   *  SelfEmployedIndicator is true (or "Y"/"yes") and reaches into
   *  the matching employer PARTY for company name + address. Falls
   *  back to whatever it can find when the XML is sparse. */
  function getSelfEmploymentInfo(doc) {
    const blank = {
      businessName: '',
      businessAddress: '',
      businessAddressLine: '',
      businessCity: '',
      businessState: '',
      businessPostal: '',
      businessPhone: '',
      employmentStartDate: '',
      monthlyIncomeAmount: ''
    };

    const flagNodes = nodesByLocalName(doc, 'SelfEmployedIndicator');
    let employmentEl = null;
    for (const f of flagNodes) {
      const v = (f.textContent || '').trim().toLowerCase();
      if (v === 'true' || v === 'y' || v === 'yes' || v === '1') {
        employmentEl = closestAncestorByLocalName(f, 'EMPLOYMENT')
          || closestAncestorByLocalName(f, 'Employment');
        if (employmentEl) break;
      }
    }
    if (!employmentEl) return blank;

    const startDate = firstTextWithin(employmentEl, 'EmploymentStartDate')
      || firstTextWithin(employmentEl, 'EmploymentDate');
    const monthlyIncome = firstTextWithin(employmentEl, 'EmploymentMonthlyIncomeAmount')
      || firstTextWithin(employmentEl, 'IncomeAmount');

    // Two layouts seen across MISMO 3.4 closings: (1) employer info
    // nested inside EMPLOYMENT itself, or (2) reachable via the
    // EMPLOYER PARTY sibling. Try the inline path first, then
    // fall back to the closest PARTY ancestor.
    const inlineLegalName = firstTextWithin(employmentEl, 'LegalEntityName');
    const inlineFullName = firstTextWithin(employmentEl, 'FullName');
    const inlineAddr = nodesByLocalName(employmentEl, 'ADDRESS')[0];
    const inlinePhone = firstTextWithin(employmentEl, 'ContactPointTelephoneValue');

    let businessName = inlineLegalName || inlineFullName || '';
    let addrEl = inlineAddr;
    let phone = inlinePhone;

    if (!businessName || !addrEl || !phone) {
      const employerParty = closestAncestorByLocalName(employmentEl, 'PARTY')
        || closestAncestorByLocalName(employmentEl, 'Party');
      if (employerParty) {
        if (!businessName) {
          businessName = firstTextWithin(employerParty, 'LegalEntityName')
            || firstTextWithin(employerParty, 'FullName');
        }
        if (!addrEl) addrEl = nodesByLocalName(employerParty, 'ADDRESS')[0];
        if (!phone) phone = firstTextWithin(employerParty, 'ContactPointTelephoneValue');
      }
    }

    const addressLine = addrEl ? firstTextWithin(addrEl, 'AddressLineText') : '';
    const city = addrEl ? firstTextWithin(addrEl, 'CityName') : '';
    const state = addrEl ? firstTextWithin(addrEl, 'StateCode') : '';
    const postal = addrEl ? firstTextWithin(addrEl, 'PostalCode') : '';
    const fullAddress = [addressLine, city, state, postal].filter(Boolean).join(', ');

    return {
      businessName: businessName || '',
      businessAddress: fullAddress,
      businessAddressLine: addressLine,
      businessCity: city,
      businessState: state,
      businessPostal: postal,
      businessPhone: phone || '',
      employmentStartDate: startDate || '',
      monthlyIncomeAmount: monthlyIncome || ''
    };
  }

  function parseMismoXml(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    const parserError = doc.getElementsByTagName('parsererror');
    if (parserError && parserError.length) {
      throw new Error('Invalid XML');
    }

    const borrowers = getBorrowers(doc);
    const borrowerName = borrowers[0] || getBorrowerFullName(doc);
    const coBorrowerName = borrowers.length > 1 ? borrowers[1] : '';
    const propertyAddress = getSubjectPropertyAddress(doc);
    const currentResidenceAddress = getCurrentResidenceAddress(doc);
    const curRes = getCurrentResidenceAddressParts(doc);
    const priRes = getPriorResidenceAddressParts(doc);
    const tinList = getTaxpayerIdentifierList(doc);
    const loanNumber = getLoanNumber(doc);

    const baseLoanAmount = textByLocalName(doc, 'BaseLoanAmount');
    const loanPurposeType = textByLocalName(doc, 'LoanPurposeType');
    const mortgageType = textByLocalName(doc, 'MortgageType');
    const loanTermMonths = textByLocalName(doc, 'LoanAmortizationTermMonthsCount') || textByLocalName(doc, 'LoanAmortizationTermMonths');
    const noteRate = textByLocalName(doc, 'NoteRatePercent') || textByLocalName(doc, 'NoteRate');
    const borrowerBirthDate = textByLocalName(doc, 'BorrowerBirthDate') || textByLocalName(doc, 'BorrowerBirthDateDate') || textByLocalName(doc, 'BorrowerBirthDateDateTime');

    // Borrower / co-borrower contact + name parts
    const primaryBorrower = getBorrowerContact(doc, 'primary');
    const secondaryBorrower = getBorrowerContact(doc, 'secondary');

    const selfEmployment = getSelfEmploymentInfo(doc);

    // Loan dates
    const loanDetails = getLoanDetails(doc);

    // Other parties — name stays empty when the role isn't present in the XML
    const lender = getPartyInfo(findPartyByRole(doc, 'NotePayTo')
      || findPartyByRole(doc, 'Lender'));
    const broker = getPartyInfo(findPartyByRole(doc, 'LoanOriginationCompany')
      || findPartyByRole(doc, 'MortgageBroker'));
    const loanOriginator = getPartyInfo(findPartyByRole(doc, 'LoanOriginator'));

    const titleVendor = getPartyInfo(findPartyByRole(doc, 'TitleInsuranceProvider')
      || findPartyByRole(doc, 'ClosingAgent')
      || findPartyByRole(doc, 'TitleCompany'));
    const titleFileNumber = textByLocalName(doc, 'TitleInsurancePolicyIdentifier');

    const buyerAgent = getPartyInfo(findPartyByRole(doc, 'BuyersRealEstateAgent')
      || findPartyByRole(doc, 'SellingAgent')); // "selling agent" in real-estate vernacular = buyer's agent
    const sellerAgent = getPartyInfo(findPartyByRole(doc, 'SellersRealEstateAgent')
      || findPartyByRole(doc, 'ListingAgent'));

    return {
      // ---- Borrower / co-borrower (existing) ----
      borrowers,
      borrowerName,
      coBorrowerName,

      // ---- Borrower contact / name parts (new) ----
      borrowerFirstName: primaryBorrower.firstName,
      borrowerMiddleName: primaryBorrower.middleName,
      borrowerLastName: primaryBorrower.lastName,
      borrowerPhone: primaryBorrower.phone,
      borrowerEmail: primaryBorrower.email,

      coBorrowerFirstName: secondaryBorrower.firstName,
      coBorrowerMiddleName: secondaryBorrower.middleName,
      coBorrowerLastName: secondaryBorrower.lastName,
      coBorrowerPhone: secondaryBorrower.phone,
      coBorrowerEmail: secondaryBorrower.email,

      // ---- Property / residence (existing) ----
      propertyAddress,
      currentResidenceAddress,
      currentResidenceLine: curRes.line,
      currentResidenceCity: curRes.city,
      currentResidenceState: curRes.state,
      currentResidencePostal: curRes.postal,
      priorResidenceLine: priRes.line,
      priorResidenceCity: priRes.city,
      priorResidenceState: priRes.state,
      priorResidencePostal: priRes.postal,
      previousResidenceAddress: composeAddressParts(priRes),

      // ---- Identifiers (existing) ----
      borrowerTin: tinList[0] || '',
      spouseTin: tinList[1] || '',
      loanNumber,
      borrowerBirthDate,

      // ---- Loan terms (existing + dates) ----
      baseLoanAmount,
      loanPurposeType,
      mortgageType,
      loanTermMonths,
      noteRate,
      closingDate: loanDetails.closingDate,
      disbursementDate: loanDetails.disbursementDate,
      loanMaturityDate: loanDetails.loanMaturityDate,
      applicationDate: loanDetails.applicationDate,
      estimatedClosingDate: loanDetails.estimatedClosingDate,

      // ---- Lender (NotePayTo / Lender PARTY) ----
      lenderName: lender.name,
      lenderAddress: lender.fullAddress,
      lenderAddressLine: lender.addressLine,
      lenderCity: lender.city,
      lenderState: lender.state,
      lenderPostal: lender.postal,
      lenderPhone: lender.phone,
      lenderEmail: lender.email,
      lenderNmls: lender.license,

      // ---- Mortgage broker / origination company ----
      brokerName: broker.name,
      brokerAddress: broker.fullAddress,
      brokerPhone: broker.phone,
      brokerEmail: broker.email,
      brokerNmls: broker.license,

      // ---- Individual loan officer (LoanOriginator role) ----
      loanOriginatorName: loanOriginator.name,
      loanOriginatorPhone: loanOriginator.phone,
      loanOriginatorEmail: loanOriginator.email,
      loanOriginatorNmls: loanOriginator.license,

      // ---- Title / closing vendor ----
      titleCompanyName: titleVendor.name,
      titleCompanyAddress: titleVendor.fullAddress,
      titleCompanyAddressLine: titleVendor.addressLine,
      titleCompanyCity: titleVendor.city,
      titleCompanyState: titleVendor.state,
      titleCompanyPostal: titleVendor.postal,
      titleCompanyPhone: titleVendor.phone,
      titleCompanyEmail: titleVendor.email,
      titleFileNumber,

      // ---- Buyer's real estate agent ----
      buyerAgentName: buyerAgent.name,
      buyerAgentFirstName: buyerAgent.firstName,
      buyerAgentLastName: buyerAgent.lastName,
      buyerAgentPhone: buyerAgent.phone,
      buyerAgentEmail: buyerAgent.email,
      buyerAgentLicense: buyerAgent.license,
      buyerAgentAddress: buyerAgent.fullAddress,

      // ---- Seller's real estate agent ----
      sellerAgentName: sellerAgent.name,
      sellerAgentFirstName: sellerAgent.firstName,
      sellerAgentLastName: sellerAgent.lastName,
      sellerAgentPhone: sellerAgent.phone,
      sellerAgentEmail: sellerAgent.email,
      sellerAgentLicense: sellerAgent.license,
      sellerAgentAddress: sellerAgent.fullAddress,

      // ---- Self-employment (for Income Statement / Balance Sheet) ----
      selfEmployedBusinessName: selfEmployment.businessName,
      selfEmployedBusinessAddress: selfEmployment.businessAddress,
      selfEmployedBusinessAddressLine: selfEmployment.businessAddressLine,
      selfEmployedBusinessCity: selfEmployment.businessCity,
      selfEmployedBusinessState: selfEmployment.businessState,
      selfEmployedBusinessPostal: selfEmployment.businessPostal,
      selfEmployedBusinessPhone: selfEmployment.businessPhone,
      selfEmployedStartDate: selfEmployment.employmentStartDate,
      selfEmployedMonthlyIncome: selfEmployment.monthlyIncomeAmount
    };
  }

  MSFG.MISMO = MSFG.MISMO || {};
  MSFG.MISMO.parseXml = parseMismoXml;
})();

