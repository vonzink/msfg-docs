'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

const {
  generateForm4506cPdfBuffer,
  FIELD_PATHS
} = require('../../../lib/pdf/form4506cPdf');

const TEMPLATE = path.join(__dirname, '../../../public/documents/irs-form-4506-c.pdf');

// Skip all tests in this file if the AcroForm template isn't available.
const hasTemplate = fs.existsSync(TEMPLATE);

test('generateForm4506cPdfBuffer integration', { skip: !hasTemplate && 'template PDF missing' }, async (t) => {
  function readField(form, name) {
    try {
      return form.getTextField(name).getText() || '';
    } catch (_e) {
      return null; // not a text field (e.g. checkbox) or missing
    }
  }

  function isChecked(form, name) {
    try {
      return form.getCheckBox(name).isChecked();
    } catch (_e) {
      return null;
    }
  }

  await t.test('known inputs land in the right AcroForm fields', async () => {
    const bytes = await generateForm4506cPdfBuffer({
      f4506TaxpayerName: 'Dr. John A Smith Jr.',
      f4506Ssn: '123-45-6789',
      f4506SpouseName: 'Jane B Smith',
      f4506SpouseSsn: '987-65-4321',
      f4506AddressLine: '100 Pine St',
      f4506Apt: 'Apt 5',
      f4506City: 'Denver',
      f4506State: 'co',
      f4506Zip: '80202',
      f4506PrevAddress: '500 Old Ave, Boston, MA 02101',
      f4506ThirdPartyName: 'Acme Lending',
      f4506ThirdPartyAddress: '123 Main St, Suite 200, Denver, CO, 80202',
      f4506ThirdPartyCaf: 'CAF-42',
      f4506LoanNumber: 'LOAN-123',
      f4506TranscriptType: 'return',
      f4506TaxYears: '2022, 2023',
      f4506TaxForm: '1040'
    });

    const loaded = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = loaded.getForm();

    // Primary name: honorific stripped, MI extracted, suffix stripped
    assert.equal(readField(form, FIELD_PATHS.primaryFirst), 'John');
    assert.equal(readField(form, FIELD_PATHS.primaryMi), 'A');
    assert.equal(readField(form, FIELD_PATHS.primaryLast), 'Smith');
    assert.equal(readField(form, FIELD_PATHS.primarySsn), '123456789');

    // Spouse
    assert.equal(readField(form, FIELD_PATHS.jointFirst), 'Jane');
    assert.equal(readField(form, FIELD_PATHS.jointMi), 'B');
    assert.equal(readField(form, FIELD_PATHS.jointLast), 'Smith');
    assert.equal(readField(form, FIELD_PATHS.jointSsn), '987654321');

    // Current address: apt appended, state uppercased
    assert.equal(readField(form, FIELD_PATHS.curStreet), '100 Pine St, Apt 5');
    assert.equal(readField(form, FIELD_PATHS.curCity), 'Denver');
    assert.equal(readField(form, FIELD_PATHS.curState), 'CO');
    assert.equal(readField(form, FIELD_PATHS.curZip), '80202');

    // Previous address parsed
    assert.equal(readField(form, FIELD_PATHS.prevStreet), '500 Old Ave');
    assert.equal(readField(form, FIELD_PATHS.prevCity), 'Boston');
    assert.equal(readField(form, FIELD_PATHS.prevState), 'MA');
    assert.equal(readField(form, FIELD_PATHS.prevZip), '02101');

    // Third party (IVES) address: 4-comma form parsed correctly
    assert.equal(readField(form, FIELD_PATHS.ivesName), 'Acme Lending');
    assert.equal(readField(form, FIELD_PATHS.ivesStreet), '123 Main St, Suite 200');
    assert.equal(readField(form, FIELD_PATHS.ivesCity), 'Denver');
    assert.equal(readField(form, FIELD_PATHS.ivesState), 'CO');
    assert.equal(readField(form, FIELD_PATHS.ivesZip), '80202');

    assert.equal(readField(form, FIELD_PATHS.customerFile), 'CAF-42');
    assert.equal(readField(form, FIELD_PATHS.uniqueId), 'LOAN-123');

    // Line 8 (tax years) — "2022, 2023" → two 12/31 rows
    const [mm0, dd0, yyyy0] = FIELD_PATHS.q8Dates[0];
    assert.equal(readField(form, mm0), '12');
    assert.equal(readField(form, dd0), '31');
    assert.equal(readField(form, yyyy0), '2022');
    const [mm1, dd1, yyyy1] = FIELD_PATHS.q8Dates[1];
    assert.equal(readField(form, mm1), '12');
    assert.equal(readField(form, dd1), '31');
    assert.equal(readField(form, yyyy1), '2023');
    // Remaining two rows empty
    const [mm2, dd2, yyyy2] = FIELD_PATHS.q8Dates[2];
    assert.equal(readField(form, mm2), '');
    assert.equal(readField(form, dd2), '');
    assert.equal(readField(form, yyyy2), '');

    // Form number row
    assert.equal(readField(form, FIELD_PATHS.formNum1), '1040');

    // Transcript type checkbox
    assert.equal(isChecked(form, FIELD_PATHS.transcriptReturn), true);
    assert.equal(isChecked(form, FIELD_PATHS.transcriptAccount), false);
    assert.equal(isChecked(form, FIELD_PATHS.transcriptRecord), false);
  });

  await t.test('no spouse block when f4506SpouseName is empty', async () => {
    const bytes = await generateForm4506cPdfBuffer({
      f4506TaxpayerName: 'John Smith',
      f4506Ssn: '111-22-3333',
      f4506AddressLine: '1 Main',
      f4506City: 'Salt Lake City',
      f4506State: 'UT',
      f4506Zip: '84101'
    });

    const loaded = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = loaded.getForm();

    assert.equal(readField(form, FIELD_PATHS.primaryFirst), 'John');
    assert.equal(readField(form, FIELD_PATHS.primaryLast), 'Smith');
    assert.equal(readField(form, FIELD_PATHS.jointFirst), '');
    assert.equal(readField(form, FIELD_PATHS.jointLast), '');
  });

  await t.test('transcript type "account" toggles the right checkbox', async () => {
    const bytes = await generateForm4506cPdfBuffer({
      f4506TaxpayerName: 'Jane Doe',
      f4506Ssn: '555-66-7777',
      f4506TranscriptType: 'account'
    });
    const form = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getForm();
    assert.equal(isChecked(form, FIELD_PATHS.transcriptReturn), false);
    assert.equal(isChecked(form, FIELD_PATHS.transcriptAccount), true);
    assert.equal(isChecked(form, FIELD_PATHS.transcriptRecord), false);
  });

  await t.test('empty input does not throw and produces a valid PDF', async () => {
    const bytes = await generateForm4506cPdfBuffer({});
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 100);
    // Magic: PDFs start with "%PDF-"
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  });
});
