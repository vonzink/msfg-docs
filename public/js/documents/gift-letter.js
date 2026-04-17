(function () {
  'use strict';

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (!el || v == null || v === '') return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function todayLong() {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function collectPayload() {
    return {
      donorName: val('giftDonorName'),
      donorAddress: val('giftDonorAddress'),
      donorPhone: val('giftDonorPhone'),
      donorEmail: val('giftDonorEmail'),
      giftAmount: val('giftAmount'),
      sourceOfGift: val('giftSourceOfGift'),
      fundTransferDate: val('giftFundTransferDate'),
      relationshipToDonor: val('giftRelationshipToDonor'),
      recipientName: val('giftRecipientName'),
      loanNumber: val('giftLoanNumber'),
      subjectPropertyAddress: val('giftPropertyAddress'),
      letterDate: val('giftLetterDate') || todayLong()
    };
  }

  async function downloadPdf(btn) {
    if (btn) { btn.disabled = true; btn.dataset._lbl = btn.dataset._lbl || btn.textContent; btn.textContent = 'Building PDF…'; }
    try {
      const resp = await MSFG.fetch(MSFG.apiUrl('/api/pdf/gift-letter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectPayload())
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Gift-Letter.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Could not generate PDF.');
    } finally {
      if (btn) { btn.disabled = false; if (btn.dataset._lbl) btn.textContent = btn.dataset._lbl; }
    }
  }

  function getEmailData() {
    return {
      title: '🎁 Gift Letter',
      sections: [
        {
          heading: 'Loan & recipient',
          rows: [
            { label: 'Loan number', value: val('giftLoanNumber') },
            { label: 'Recipient', value: val('giftRecipientName') },
            { label: 'Property', value: val('giftPropertyAddress') },
            { label: 'Letter date', value: val('giftLetterDate') }
          ]
        },
        {
          heading: 'Gift',
          rows: [
            { label: 'Amount', value: val('giftAmount') },
            { label: 'Transfer date', value: val('giftFundTransferDate') },
            { label: 'Source', value: val('giftSourceOfGift') }
          ]
        },
        {
          heading: 'Donor',
          rows: [
            { label: 'Name', value: val('giftDonorName') },
            { label: 'Relationship', value: val('giftRelationshipToDonor') },
            { label: 'Phone', value: val('giftDonorPhone') },
            { label: 'Email', value: val('giftDonorEmail') },
            { label: 'Address', value: val('giftDonorAddress') }
          ]
        }
      ]
    };
  }

  /* ---- MISMO prepop ---- */
  function applyMismo(parsed) {
    if (!parsed) return;
    setVal('giftLoanNumber', parsed.loanNumber);
    setVal('giftRecipientName', parsed.borrowerName);
    setVal('giftPropertyAddress', parsed.propertyAddress);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!val('giftLetterDate')) setVal('giftLetterDate', todayLong());

    document.getElementById('btnGiftDownloadPdf').addEventListener('click', function () {
      downloadPdf(this);
    });

    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'MSFG_MISMO') return;
      applyMismo(e.data.payload && e.data.payload.parsed);
    });
    // If MISMO was already imported before the iframe loaded, ask the
    // workspace parent to re-broadcast.
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'MSFG_MISMO_REQUEST' }, window.location.origin);
      }
    } catch (_e) { /* ignore */ }

    if (window.MSFG && MSFG.ReportTemplates) {
      MSFG.ReportTemplates.registerExtractor('gift-letter', getEmailData);
    }
    if (window.MSFG && MSFG.DocActions) {
      MSFG.DocActions.register(getEmailData);
      if (typeof MSFG.DocActions.registerCapture === 'function') {
        MSFG.DocActions.registerCapture(function () {
          return MSFG.fetch(MSFG.apiUrl('/api/pdf/gift-letter'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectPayload())
          }).then(function (resp) {
            if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
            return resp.arrayBuffer();
          }).then(function (buf) {
            return {
              pdfBytes: new Uint8Array(buf),
              name: 'Gift Letter',
              icon: '🎁',
              slug: 'gift-letter',
              data: getEmailData(),
              filename: 'Gift-Letter.pdf'
            };
          });
        });
      }
    }
  });
})();
