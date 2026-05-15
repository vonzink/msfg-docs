'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../../../public/js/shared/application-summary-core');

test('application summary core', async (t) => {
  await t.test('marks two-year residence coverage complete from current plus prior homes', () => {
    const model = core.createApplicationSummaryModel({
      parsed: {
        borrowerName: 'Veronica Sawaged',
        loanNumber: 'R008797',
        propertyAddress: '17630 East 104th Place, Commerce City, CO 80022'
      },
      residences: [
        { borrowerName: 'Veronica Sawaged', type: 'Current', address: '3040 West 107th Place, Westminster, CO 80031', years: 0, months: 6 },
        { borrowerName: 'Veronica Sawaged', type: 'Prior', address: '7968 West 82nd Place, Arvada, CO 80005', years: 18, months: 0 }
      ],
      employments: [
        { borrowerName: 'Veronica Sawaged', type: 'Current', employerName: 'RFI LLC', title: 'Quality Control', years: 2, months: 0, monthlyIncome: '4416' }
      ]
    }, { now: new Date('2026-05-14T12:00:00Z') });

    assert.equal(model.residenceCoverage.status, 'complete');
    assert.equal(model.residenceCoverage.coveredMonths, 222);
    assert.equal(model.employmentCoverage.status, 'complete');
    assert.equal(model.actionItems.length, 0);
  });

  await t.test('flags missing prior employment when current job is under two years', () => {
    const model = core.createApplicationSummaryModel({
      parsed: { borrowerName: 'Jane Borrower' },
      residences: [
        { borrowerName: 'Jane Borrower', type: 'Current', address: '100 Current St', years: 3, months: 0 }
      ],
      employments: [
        { borrowerName: 'Jane Borrower', type: 'Current', employerName: 'New Employer', years: 0, months: 8 }
      ]
    }, { now: new Date('2026-05-14T12:00:00Z') });

    assert.equal(model.employmentCoverage.status, 'needs-review');
    assert.equal(model.employmentCoverage.missingMonths, 16);
    assert.deepEqual(model.actionItems.map(item => item.area), ['Employment']);
  });

  await t.test('checks two-year history per borrower instead of pooling applicants together', () => {
    const model = core.createApplicationSummaryModel({
      borrowerProfiles: [{ name: 'Jane Borrower' }, { name: 'John CoBorrower' }],
      parsed: { borrowerName: 'Jane Borrower', coBorrowerName: 'John CoBorrower' },
      residences: [
        { borrowerName: 'Jane Borrower', type: 'Current', address: '100 Current St', years: 4, months: 0 },
        { borrowerName: 'John CoBorrower', type: 'Current', address: '200 Short St', years: 0, months: 8 }
      ],
      employments: [
        { borrowerName: 'Jane Borrower', type: 'Current', employerName: 'Long Job', years: 5, months: 0 },
        { borrowerName: 'John CoBorrower', type: 'Current', employerName: 'Short Job', years: 0, months: 10 }
      ]
    }, { now: new Date('2026-05-14T12:00:00Z') });

    assert.equal(model.residenceCoverage.status, 'needs-review');
    assert.equal(model.employmentCoverage.status, 'needs-review');
    assert.deepEqual(model.actionItems.map(item => item.borrowerName), ['John CoBorrower', 'John CoBorrower']);
  });

  await t.test('builds one borrower page per URLA applicant with borrower-specific history and actions', () => {
    const model = core.createApplicationSummaryModel({
      borrowerProfiles: [{ name: 'Jane Borrower', roleType: 'Borrower' }, { name: 'John CoBorrower', roleType: 'Cosigner' }],
      parsed: { borrowerName: 'Jane Borrower', coBorrowerName: 'John CoBorrower' },
      residences: [
        { borrowerName: 'Jane Borrower', type: 'Current', address: '100 Current St', years: 4, months: 0 },
        { borrowerName: 'John CoBorrower', type: 'Current', address: '200 Short St', years: 0, months: 8 }
      ],
      employments: [
        { borrowerName: 'Jane Borrower', type: 'Current', employerName: 'Long Job', years: 5, months: 0 },
        { borrowerName: 'John CoBorrower', type: 'Current', employerName: 'Short Job', years: 0, months: 10 }
      ],
      declarationSummaries: [
        { borrowerName: 'Jane Borrower', intentToOccupy: 'Yes' },
        { borrowerName: 'John CoBorrower', intentToOccupy: 'No' }
      ]
    }, { now: new Date('2026-05-14T12:00:00Z') });

    assert.equal(model.borrowerPages.length, 2);
    assert.equal(model.borrowerPages[0].borrowerName, 'Jane Borrower');
    assert.equal(model.borrowerPages[0].residences.length, 1);
    assert.equal(model.borrowerPages[0].actionItems.length, 0);
    assert.equal(model.borrowerPages[1].borrowerName, 'John CoBorrower');
    assert.equal(model.borrowerPages[1].employments[0].employerName, 'Short Job');
    assert.deepEqual(model.borrowerPages[1].actionItems.map(item => item.area), ['Residence', 'Employment']);
  });

  await t.test('derives coverage from start and end dates when explicit duration is missing', () => {
    const model = core.createApplicationSummaryModel({
      parsed: { borrowerName: 'Jane Borrower' },
      residences: [
        { borrowerName: 'Jane Borrower', type: 'Current', address: '100 Current St', startDate: '2025-11-01' },
        { borrowerName: 'Jane Borrower', type: 'Prior', address: '20 Prior St', startDate: '2023-05-01', endDate: '2025-10-31' }
      ],
      employments: [
        { borrowerName: 'Jane Borrower', type: 'Current', employerName: 'Employer', startDate: '2024-05-01' }
      ]
    }, { now: new Date('2026-05-14T12:00:00Z') });

    assert.equal(model.residenceCoverage.status, 'complete');
    assert.ok(model.residenceCoverage.coveredMonths >= 36);
    assert.equal(model.employmentCoverage.status, 'complete');
    assert.ok(model.employmentCoverage.coveredMonths >= 24);
  });
});
