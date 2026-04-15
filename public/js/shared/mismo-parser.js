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

    return {
      borrowers,
      borrowerName,
      coBorrowerName,
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
      borrowerTin: tinList[0] || '',
      spouseTin: tinList[1] || '',
      loanNumber,
      baseLoanAmount,
      loanPurposeType,
      mortgageType,
      loanTermMonths,
      noteRate,
      borrowerBirthDate
    };
  }

  MSFG.MISMO = MSFG.MISMO || {};
  MSFG.MISMO.parseXml = parseMismoXml;
})();

