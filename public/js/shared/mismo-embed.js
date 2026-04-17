/* =====================================================
   MISMO -> Document auto-fill (embed-friendly)
   Receives MISMO payload from workspace and applies mappings
   ===================================================== */
'use strict';

(function() {
  function trigger(el, name) {
    const evt = new Event(name, { bubbles: true, cancelable: true });
    el.dispatchEvent(evt);
  }

  function setInput(el, value) {
    if (!el) return;
    const v = value == null ? '' : String(value);
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, v);
    else el.value = v;
    trigger(el, 'input');
    trigger(el, 'change');
  }

  function setSelect(el, value) {
    if (!el) return;
    const v = value == null ? '' : String(value);
    for (let i = 0; i < el.options.length; i++) {
      const opt = el.options[i];
      if (opt.value === v || opt.text === v) {
        el.selectedIndex = i;
        trigger(el, 'change');
        return;
      }
    }
  }

  function formatCurrencyNumber(n) {
    const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[,$]/g, ''));
    if (!isFinite(num) || num <= 0) return '';
    return '$' + Math.round(num).toLocaleString('en-US');
  }

  function formatPercent(p) {
    const num = typeof p === 'number' ? p : parseFloat(String(p).replace(/[%\s]/g, ''));
    if (!isFinite(num) || num <= 0) return '';
    return num.toFixed(3) + '%';
  }

  function applyToPreApproval(parsed) {
    setInput(document.getElementById('borrowerName'), parsed.borrowerName || '');
    setInput(document.getElementById('borrowerAddress'), parsed.propertyAddress || '');

    // Conservative mapping: only set if it clearly matches existing options
    if (parsed.mortgageType) setSelect(document.getElementById('loanType'), parsed.mortgageType);
    if (parsed.loanPurposeType) setSelect(document.getElementById('loanPurpose'), parsed.loanPurposeType);

    if (parsed.baseLoanAmount) setInput(document.getElementById('approvalAmount'), formatCurrencyNumber(parsed.baseLoanAmount));
    if (parsed.noteRate) setInput(document.getElementById('interestRate'), formatPercent(parsed.noteRate));

    // If loanTermMonths looks like 360, map to term select options if present
    if (parsed.loanTermMonths) setSelect(document.getElementById('loanTerm'), parsed.loanTermMonths);
  }

  function applyToAddressLox(parsed) {
    const nameEl = document.getElementById('borrowerName') || document.getElementById('name') || document.getElementById('fullName');
    const addrEl = document.getElementById('address') || document.getElementById('borrowerAddress') || document.getElementById('propertyAddress');
    if (nameEl) setInput(nameEl, parsed.borrowerName || '');
    if (addrEl) setInput(addrEl, parsed.propertyAddress || '');

    const cur = document.getElementById('currentAddress');
    const prev = document.getElementById('previousAddress');
    if (cur) setInput(cur, parsed.currentResidenceAddress || parsed.propertyAddress || '');
    if (prev) setInput(prev, parsed.previousResidenceAddress || '');
  }

  function applyToCreditInquiry(parsed) {
    setInput(document.getElementById('senderName'), parsed.borrowerName || '');
    setInput(document.getElementById('coBorrowerName'), parsed.coBorrowerName || '');
    setInput(document.getElementById('subjectPropertyAddress'), parsed.propertyAddress || '');
    setInput(document.getElementById('loanNumber'), parsed.loanNumber || '');

    const dateEl = document.getElementById('letterDate');
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      dateEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function splitCommaAddress(full) {
    const s = String(full || '').trim();
    if (!s) return { line: '', city: '', state: '', zip: '' };
    const parts = s.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const line = parts[0];
      const city = parts[1];
      const last = parts[parts.length - 1];
      const m = last.match(/^([A-Za-z]{2})\s+(\d{5}(-\d{4})?)$/);
      if (m) {
        return { line: line, city: city, state: m[1].toUpperCase(), zip: m[2] };
      }
    }
    return { line: s, city: '', state: '', zip: '' };
  }

  function applyToForm4506c(parsed) {
    setInput(document.getElementById('f4506LoanNumber'), parsed.loanNumber || '');
    setInput(document.getElementById('f4506TaxpayerName'), parsed.borrowerName || '');
    setInput(document.getElementById('f4506SpouseName'), parsed.coBorrowerName || '');
    if (parsed.borrowerTin) setInput(document.getElementById('f4506Ssn'), parsed.borrowerTin);
    if (parsed.spouseTin) setInput(document.getElementById('f4506SpouseSsn'), parsed.spouseTin);

    let line = parsed.currentResidenceLine || '';
    let city = parsed.currentResidenceCity || '';
    let state = parsed.currentResidenceState || '';
    let zip = parsed.currentResidencePostal || '';
    if (!line && !city && parsed.propertyAddress) {
      const sp = splitCommaAddress(parsed.propertyAddress);
      line = sp.line;
      city = sp.city;
      state = sp.state;
      zip = sp.zip;
    }
    setInput(document.getElementById('f4506AddressLine'), line);
    setInput(document.getElementById('f4506City'), city);
    setInput(document.getElementById('f4506State'), state);
    setInput(document.getElementById('f4506Zip'), zip);
  }

  function applyToSsa89(parsed) {
    setInput(document.getElementById('sSsaLoanNumber'), parsed.loanNumber || '');
    setInput(document.getElementById('sSsaPrintedName'), parsed.borrowerName || '');
    if (parsed.borrowerTin) setInput(document.getElementById('sSsaSsn'), parsed.borrowerTin);
    if (parsed.borrowerBirthDate) setInput(document.getElementById('sSsaDob'), parsed.borrowerBirthDate);

    // Default the signature line to the borrower's printed name; the borrower
    // signs in pen, but we pre-fill the name so the worksheet preview reads cleanly.
    const sig = document.getElementById('sSsaSignature');
    if (sig && !sig.value && parsed.borrowerName) setInput(sig, parsed.borrowerName);
  }

  function applyToIncomeStatement(parsed) {
    // Borrower-as-business header — populates self-employer fields if
    // present in MISMO; otherwise leaves the placeholder.
    setInput(document.getElementById('businessName'), parsed.selfEmployedBusinessName || '');
    setInput(document.getElementById('ownerName'), parsed.borrowerName || '');
  }

  function applyToBalanceSheet(parsed) {
    setInput(document.getElementById('businessName'), parsed.selfEmployedBusinessName || '');
    setInput(document.getElementById('ownerName'), parsed.borrowerName || '');
  }

  function applyToInvoice(parsed) {
    // The Generic Invoice "To" block is the recipient — for a mortgage
    // workflow that's the borrower at the subject property. "From" is
    // already MSFG by default (placeholder is the company name).
    setInput(document.getElementById('toName'), parsed.borrowerName || '');
    setInput(document.getElementById('toAddress'), parsed.propertyAddress || '');
    // Loan number maps naturally to the invoice number when one isn't
    // already entered.
    const inv = document.getElementById('invoiceNumber');
    if (inv && !inv.value && parsed.loanNumber) setInput(inv, parsed.loanNumber);
  }

  function applyMismoPayload(payload) {
    const parsed = payload && payload.parsed;
    if (!parsed) return;

    const slug = window.__docSlug || (document.querySelector('.site-main') && document.querySelector('.site-main').dataset && document.querySelector('.site-main').dataset.docSlug);
    if (slug === 'pre-approval') return applyToPreApproval(parsed);
    if (slug === 'address-lox') return applyToAddressLox(parsed);
    if (slug === 'credit-inquiry') return applyToCreditInquiry(parsed);
    if (slug === 'form-4506-c') return applyToForm4506c(parsed);
    if (slug === 'ssa-89') return applyToSsa89(parsed);
    if (slug === 'invoice') return applyToInvoice(parsed);
    if (slug === 'income-statement') return applyToIncomeStatement(parsed);
    if (slug === 'balance-sheet') return applyToBalanceSheet(parsed);
  }

  window.addEventListener('message', function(e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data) return;
    if (e.data.type === 'MSFG_MISMO') applyMismoPayload(e.data.payload);
  });

  // If this doc iframe loaded after MISMO import, ask the workspace for current payload
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
    }
  } catch (e) { /* ignore */ }
})();

