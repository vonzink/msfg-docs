(function () {
  'use strict';

  const val = MSFG.val;
  const setVal = MSFG.setVal;
  const todayLong = MSFG.formatDateLong;

  /* ---- In-page preview rendering (pure render; LetterDoc gates it) ---- */
  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const borrowerNames = val('loxBorrowerNames');
    const loanNumber = val('loxLoanNumber');
    const propertyAddress = val('loxPropertyAddress');
    const letterDate = val('loxLetterDate') || todayLong();
    const topic = val('loxTopic');
    const explanation = val('loxExplanation');
    const signers = ['loxSigner1', 'loxSigner2', 'loxSigner3', 'loxSigner4', 'loxSigner5']
      .map(function (id, i) { return val(id) || ('Borrower ' + (i + 1)); });

    if (!borrowerNames && !explanation) {
      preview.innerHTML = '<p class="text-muted text-center">Fill in the fields above to generate your letter of explanation.</p>';
      return;
    }

    const v = function (x) { return x ? MSFG.escHtml(x) : '&mdash;'; };

    let html = '<div class="letter-content">';
    html += '<h2 style="text-align:center;margin:0 0 var(--space-md);">Letter of Explanation</h2>';
    html += '<p class="letter-date">' + MSFG.escHtml(letterDate) + '</p>';
    html += '<table>';
    html += '<tr><td>Loan Number</td><td>' + v(loanNumber) + '</td></tr>';
    html += '<tr><td>Borrower(s)</td><td>' + v(borrowerNames) + '</td></tr>';
    html += '<tr><td>Property Address</td><td>' + v(propertyAddress) + '</td></tr>';
    if (topic) html += '<tr><td>Subject</td><td>' + v(topic) + '</td></tr>';
    html += '</table>';

    if (explanation) {
      html += '<p>' + MSFG.escHtml(explanation).replace(/\n/g, '<br>') + '</p>';
    }

    html += '<p>I certify that the above information is true and correct to the best of my knowledge.</p>';
    html += '<table style="margin-top:var(--space-lg);">';
    signers.slice(0, 5).forEach(function (name) {
      html += '<tr><td>' + MSFG.escHtml(name) + '</td><td>____________________________</td><td>Date</td><td>__________</td></tr>';
    });
    html += '</table>';
    html += '</div>';

    preview.innerHTML = html;
  }

  function collectPayload() {
    const signers = ['loxSigner1', 'loxSigner2', 'loxSigner3', 'loxSigner4', 'loxSigner5']
      .map((id) => ({ name: val(id) }))
      .filter((s, idx, all) => {
        // Drop trailing blanks so the PDF doesn't render empty signature lines
        // past the last named signer; keep blanks if a later slot has a value
        // (preserves the sequence the LO entered).
        if (s.name) return true;
        for (let j = idx + 1; j < all.length; j++) if (all[j].name) return true;
        return false;
      });
    const ls = (window.MSFG && window.MSFG.LetterSettings) ? window.MSFG.LetterSettings.read() : null;
    return {
      borrowerNames: val('loxBorrowerNames'),
      loanNumber: val('loxLoanNumber'),
      subjectPropertyAddress: val('loxPropertyAddress'),
      letterDate: val('loxLetterDate') || todayLong(),
      topic: val('loxTopic'),
      explanation: val('loxExplanation'),
      signers,
      letterSettings: ls
    };
  }

  function getEmailData() {
    const sigList = ['loxSigner1', 'loxSigner2', 'loxSigner3', 'loxSigner4', 'loxSigner5']
      .map((id, i) => val(id) || ('Borrower ' + (i + 1)))
      .join(', ');
    return {
      title: '📝 Letter of Explanation',
      sections: [
        {
          heading: 'Loan & borrower',
          rows: [
            { label: 'Loan number', value: val('loxLoanNumber') },
            { label: 'Borrower(s)', value: val('loxBorrowerNames') },
            { label: 'Property', value: val('loxPropertyAddress') },
            { label: 'Letter date', value: val('loxLetterDate') }
          ]
        },
        {
          heading: 'Subject & explanation',
          rows: [
            { label: 'Subject', value: val('loxTopic') },
            { label: 'Explanation', value: val('loxExplanation') }
          ]
        },
        {
          heading: 'Signers',
          rows: [{ label: 'On signature lines', value: sigList }]
        }
      ]
    };
  }

  /* MISMO prepop */
  function applyMismo(parsed) {
    if (!parsed) return;
    setVal('loxLoanNumber', parsed.loanNumber);
    setVal('loxPropertyAddress', parsed.propertyAddress);
    // Borrower(s) — combine primary + co-borrower if both present
    const borrowers = [parsed.borrowerName, parsed.coBorrowerName].filter(Boolean).join(', ');
    if (borrowers) setVal('loxBorrowerNames', borrowers);
    // Pre-fill signer slots with the borrower names so the PDF caption
    // labels read with real names instead of "Borrower 1 / Borrower 2".
    if (parsed.borrowerName) setVal('loxSigner1', parsed.borrowerName);
    if (parsed.coBorrowerName) setVal('loxSigner2', parsed.coBorrowerName);
  }

  MSFG.LetterDoc.init({
    slug: 'generic-lox',
    name: 'Letter of Explanation',
    icon: '📝',
    filename: 'Letter-of-Explanation.pdf',
    downloadBtnId: 'btnLoxDownloadPdf',
    resetBtnId: 'loxResetPreview',
    dateFieldId: 'loxLetterDate',
    previewFields: ['loxBorrowerNames', 'loxLoanNumber', 'loxPropertyAddress',
      'loxLetterDate', 'loxTopic', 'loxExplanation',
      'loxSigner1', 'loxSigner2', 'loxSigner3', 'loxSigner4', 'loxSigner5'],
    generate: generateLetter,
    collectPayload: collectPayload,
    getEmailData: getEmailData,
    applyMismo: applyMismo
  });
})();
