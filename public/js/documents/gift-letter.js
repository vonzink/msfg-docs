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

  /* ---- In-page preview rendering ----
     Renders the gift letter as HTML in the .letter-preview div. The
     visual style comes from the picker partial (CSS classes
     letter-preview--style-*); the structure is the same across all
     four styles, the CSS does the heavy lifting. */
  let previewDirty = false;

  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;
    if (previewDirty) return;

    const donorName = val('giftDonorName');
    const donorAddress = val('giftDonorAddress');
    const donorPhone = val('giftDonorPhone');
    const donorEmail = val('giftDonorEmail');
    const giftAmount = val('giftAmount');
    const sourceOfGift = val('giftSourceOfGift');
    const fundTransferDate = val('giftFundTransferDate');
    const relationship = val('giftRelationshipToDonor');
    const recipient = val('giftRecipientName');
    const loanNumber = val('giftLoanNumber');
    const propertyAddress = val('giftPropertyAddress');
    const letterDate = val('giftLetterDate') || todayLong();

    if (!donorName && !recipient && !giftAmount) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your gift letter.</p>';
      return;
    }

    const blank = '_______________________';
    const v = function (x) { return x ? MSFG.escHtml(x) : blank; };

    let html = '<div class="letter-content">';
    html += '<h2 style="text-align:center;margin:0 0 var(--space-md);">Gift Letter</h2>';
    html += '<p class="letter-date">' + MSFG.escHtml(letterDate) + '</p>';
    html += '<table>';
    html += '<tr><td>Loan Number</td><td>' + v(loanNumber) + '</td></tr>';
    html += '<tr><td>Applicant(s)</td><td>' + v(recipient) + '</td></tr>';
    html += '<tr><td>Address</td><td>' + v(propertyAddress) + '</td></tr>';
    html += '</table>';

    html += '<p>I, <strong>' + v(donorName) + '</strong>, do hereby certify the following:</p>';
    html += '<ol>';
    html += '<li>I have made a gift of <strong>' + v(giftAmount) + '</strong> to <strong>' + v(recipient) + '</strong>, whose relationship is <strong>' + v(relationship) + '</strong>.</li>';
    html += '<li>This gift is to be applied towards the purchase of the property located at <strong>' + v(propertyAddress) + '</strong>.</li>';
    html += '<li>No repayment of this gift is expected or implied in the form of cash or by future services of the recipient.</li>';
    html += '<li>The funds given to the homebuyer were not made available to the donor from any person or entity with an interest in the sale of the property including the seller, real estate agent or broker, builder, loan officer, or any entity associated with them.</li>';
    html += '<li>The source of this gift is <strong>' + v(sourceOfGift) + '</strong>.</li>';
    html += '<li>The date the funds were transferred: <strong>' + v(fundTransferDate) + '</strong>.</li>';
    html += '</ol>';

    html += '<table style="margin-top:var(--space-lg);">';
    html += '<tr><td>Donor signature</td><td>____________________________</td><td>Date</td><td>__________</td></tr>';
    html += '<tr><td>Donor name (print)</td><td>' + v(donorName) + '</td><td>Phone</td><td>' + v(donorPhone) + '</td></tr>';
    if (donorAddress || donorEmail) {
      html += '<tr><td>Donor address</td><td colspan="3">' + v(donorAddress) + (donorEmail ? ' &middot; ' + MSFG.escHtml(donorEmail) : '') + '</td></tr>';
    }
    html += '</table>';
    html += '</div>';

    preview.innerHTML = html;
  }

  function collectPayload() {
    const style = document.getElementById('letterStyleSelect');
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
      letterDate: val('giftLetterDate') || todayLong(),
      letterStyle: style ? style.value : 'classic'
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

    // Live preview wiring
    const previewFields = ['giftDonorName', 'giftDonorAddress', 'giftDonorPhone', 'giftDonorEmail',
      'giftAmount', 'giftSourceOfGift', 'giftFundTransferDate', 'giftRelationshipToDonor',
      'giftRecipientName', 'giftLoanNumber', 'giftPropertyAddress', 'giftLetterDate'];
    previewFields.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', generateLetter);
      el.addEventListener('change', generateLetter);
    });
    const preview = document.getElementById('letterPreview');
    if (preview) preview.addEventListener('input', function () { previewDirty = true; });
    const reset = document.getElementById('giftResetPreview');
    if (reset) reset.addEventListener('click', function (e) {
      e.preventDefault(); previewDirty = false; generateLetter();
    });
    generateLetter();

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
