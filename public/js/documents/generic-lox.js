(function () {
  'use strict';

  const val = MSFG.val;
  const setVal = MSFG.setVal;
  const todayLong = MSFG.formatDateLong;

  let borrowers = null;

  /* ---- In-page preview rendering (pure render; LetterDoc gates it) ---- */
  function generateLetter() {
    const preview = document.getElementById('letterPreview');
    if (!preview) return;

    const selected = borrowers ? borrowers.getSelected() : [];
    const borrowerNames = MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; }));
    const loanNumber = val('loxLoanNumber');
    const propertyAddress = val('loxPropertyAddress');
    const letterDate = val('loxLetterDate') || todayLong();
    const topic = val('loxTopic');
    const explanation = val('loxExplanation');
    const signers = selected.length ? selected.map(function (b) { return b.name; }) : ['Borrower 1'];

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
    // Blank signature line + printed name beneath (matches the PDF); no date —
    // borrowers don't date the letter.
    signers.slice(0, 8).forEach(function (nm) {
      html += '<tr><td style="padding-right:1.5rem;">____________________________</td>'
        + '<td>' + (nm ? '<strong>' + MSFG.escHtml(nm) + '</strong><br>' : '')
        + '<span class="text-muted">Signature</span></td></tr>';
    });
    html += '</table>';
    html += '</div>';

    preview.innerHTML = html;
  }

  function collectPayload() {
    const selected = borrowers ? borrowers.getSelected() : [];
    const ls = (window.MSFG && window.MSFG.LetterSettings) ? window.MSFG.LetterSettings.read() : null;
    return {
      borrowers: selected,
      borrowerNames: MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; })),
      loanNumber: val('loxLoanNumber'),
      subjectPropertyAddress: val('loxPropertyAddress'),
      letterDate: val('loxLetterDate') || todayLong(),
      topic: val('loxTopic'),
      explanation: val('loxExplanation'),
      signers: selected.map(function (b) { return { name: b.name }; }),
      letterSettings: ls
    };
  }

  function getEmailData() {
    const selected = borrowers ? borrowers.getSelected() : [];
    const names = MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; }));
    return {
      title: '📝 Letter of Explanation',
      sections: [
        {
          heading: 'Loan & borrower',
          rows: [
            { label: 'Loan number', value: val('loxLoanNumber') },
            { label: 'Borrower(s)', value: names },
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
          rows: [{ label: 'On signature lines', value: names }]
        }
      ]
    };
  }

  /* MISMO prepop */
  function applyMismo(parsed) {
    if (!parsed) return;
    setVal('loxLoanNumber', parsed.loanNumber);
    setVal('loxPropertyAddress', parsed.propertyAddress);
    if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);
  }

  MSFG.LetterDoc.init({
    slug: 'generic-lox',
    name: 'Letter of Explanation',
    icon: '📝',
    filename: 'Letter-of-Explanation.pdf',
    downloadBtnId: 'btnLoxDownloadPdf',
    resetBtnId: 'loxResetPreview',
    dateFieldId: 'loxLetterDate',
    previewFields: ['loxLoanNumber', 'loxPropertyAddress',
      'loxLetterDate', 'loxTopic', 'loxExplanation'],
    generate: generateLetter,
    collectPayload: collectPayload,
    getEmailData: getEmailData,
    applyMismo: applyMismo,
    onReady: function (api) {
      borrowers = MSFG.Borrowers.init({ containerId: 'borrowersList', addBtnId: 'addBorrower', onChange: api.regenerate });
    }
  });
})();
