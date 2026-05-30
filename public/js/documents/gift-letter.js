(function () {
  'use strict';

  const val = MSFG.val;
  const setVal = MSFG.setVal;
  const todayLong = MSFG.formatDateLong;

  // Shared multi-borrower list — here the rows are the gift RECIPIENT(S)
  // (the loan's borrowers). The donor fields stay separate. Wired in onReady.
  let borrowers = null;

  /* ---- In-page preview rendering ----
     Renders the gift letter as HTML in the .letter-preview div. The
     visual style comes from the picker partial (CSS classes
     letter-preview--style-*); the structure is the same across all
     four styles, the CSS does the heavy lifting.
     Pure render — LetterDoc gates it (no self dirty-check). */
  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const donorName = val('giftDonorName');
    const donorAddress = val('giftDonorAddress');
    const donorPhone = val('giftDonorPhone');
    const donorEmail = val('giftDonorEmail');
    const giftAmount = val('giftAmount');
    const sourceOfGift = val('giftSourceOfGift');
    const fundTransferDate = val('giftFundTransferDate');
    const relationship = val('giftRelationshipToDonor');
    const selected = borrowers ? borrowers.getSelected() : [];
    const recipient = MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; }));
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

    const notes = val('giftNotes');
    if (notes && notes.trim()) {
      html += '<p>' + MSFG.escHtml(notes.trim()).replace(/\n/g, '<br>') + '</p>';
    }

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
    const selected = borrowers ? borrowers.getSelected() : [];
    const ls = (window.MSFG && window.MSFG.LetterSettings) ? window.MSFG.LetterSettings.read() : null;
    return {
      donorName: val('giftDonorName'),
      donorAddress: val('giftDonorAddress'),
      donorPhone: val('giftDonorPhone'),
      donorEmail: val('giftDonorEmail'),
      giftAmount: val('giftAmount'),
      sourceOfGift: val('giftSourceOfGift'),
      fundTransferDate: val('giftFundTransferDate'),
      relationshipToDonor: val('giftRelationshipToDonor'),
      recipients: selected,
      recipientNames: MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; })),
      loanNumber: val('giftLoanNumber'),
      subjectPropertyAddress: val('giftPropertyAddress'),
      letterDate: val('giftLetterDate') || todayLong(),
      additionalNotes: val('giftNotes'),
      letterSettings: ls
    };
  }

  function getEmailData() {
    const selected = borrowers ? borrowers.getSelected() : [];
    const recipientNames = MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; }));
    return {
      title: '🎁 Gift Letter',
      sections: [
        {
          heading: 'Loan & recipient',
          rows: [
            { label: 'Loan number', value: val('giftLoanNumber') },
            { label: 'Recipient', value: recipientNames },
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
    // The loan's borrowers ARE the gift recipients. Donor is unrelated and untouched.
    if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);
    setVal('giftPropertyAddress', parsed.propertyAddress);
  }

  MSFG.LetterDoc.init({
    slug: 'gift-letter',
    name: 'Gift Letter',
    icon: '🎁',
    filename: 'Gift-Letter.pdf',
    downloadBtnId: 'btnGiftDownloadPdf',
    resetBtnId: 'giftResetPreview',
    dateFieldId: 'giftLetterDate',
    previewFields: ['giftDonorName', 'giftDonorAddress', 'giftDonorPhone', 'giftDonorEmail',
      'giftAmount', 'giftSourceOfGift', 'giftFundTransferDate', 'giftRelationshipToDonor',
      'giftLoanNumber', 'giftPropertyAddress', 'giftLetterDate', 'giftNotes'],
    generate: generateLetter,
    collectPayload: collectPayload,
    getEmailData: getEmailData,
    applyMismo: applyMismo,
    onReady: function (api) {
      borrowers = MSFG.Borrowers.init({ containerId: 'borrowersList', addBtnId: 'addBorrower', rowLabel: 'Recipient', onChange: api.regenerate });
    }
  });
})();
