'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  splitPersonName,
  parseThirdPartyAddress,
  parsePrevAddress,
  taxFormToPdfValues,
  distributeTaxYears,
  digitsOnly
} = require('../../../lib/pdf/form4506cPdf');

test('splitPersonName', async (t) => {
  await t.test('empty and falsy inputs', () => {
    assert.deepEqual(splitPersonName(''), { first: '', mi: '', last: '' });
    assert.deepEqual(splitPersonName(null), { first: '', mi: '', last: '' });
    assert.deepEqual(splitPersonName(undefined), { first: '', mi: '', last: '' });
    assert.deepEqual(splitPersonName('   '), { first: '', mi: '', last: '' });
  });

  await t.test('single token', () => {
    assert.deepEqual(splitPersonName('Madonna'), { first: 'Madonna', mi: '', last: '' });
  });

  await t.test('simple first + last', () => {
    assert.deepEqual(splitPersonName('John Smith'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('first + middle initial + last', () => {
    assert.deepEqual(splitPersonName('John A Smith'), { first: 'John', mi: 'A', last: 'Smith' });
  });

  await t.test('first + middle initial with dot + last', () => {
    assert.deepEqual(splitPersonName('John A. Smith'), { first: 'John', mi: 'A', last: 'Smith' });
  });

  await t.test('two-word first name without single-letter tail', () => {
    assert.deepEqual(splitPersonName('Mary Jo Smith'), { first: 'Mary Jo', mi: '', last: 'Smith' });
  });

  await t.test('honorific is stripped: Dr.', () => {
    assert.deepEqual(splitPersonName('Dr. John Smith'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('honorific is stripped: Mr', () => {
    assert.deepEqual(splitPersonName('Mr John Smith'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('honorific preserved if only token', () => {
    // "Dr." alone — after stripping punctuation it's "Dr", single token kept as first
    assert.deepEqual(splitPersonName('Dr.'), { first: 'Dr', mi: '', last: '' });
  });

  await t.test('suffix is stripped: Jr.', () => {
    assert.deepEqual(splitPersonName('John Smith Jr.'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('suffix is stripped: III', () => {
    assert.deepEqual(splitPersonName('John Smith III'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('suffix with comma: "John Smith, Jr."', () => {
    assert.deepEqual(splitPersonName('John Smith, Jr.'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('last-comma-first form', () => {
    assert.deepEqual(splitPersonName('Smith, John'), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('last-comma-first with middle initial', () => {
    assert.deepEqual(splitPersonName('Smith, John A'), { first: 'John', mi: 'A', last: 'Smith' });
  });

  await t.test('honorific + middle initial + suffix', () => {
    assert.deepEqual(
      splitPersonName('Dr. John A Smith Jr.'),
      { first: 'John', mi: 'A', last: 'Smith' }
    );
  });

  await t.test('MI is uppercased', () => {
    assert.deepEqual(splitPersonName('John a Smith'), { first: 'John', mi: 'A', last: 'Smith' });
  });

  await t.test('extra whitespace is normalized', () => {
    assert.deepEqual(splitPersonName('  John   Smith  '), { first: 'John', mi: '', last: 'Smith' });
  });

  await t.test('very long names are truncated at 80 chars each', () => {
    const longFirst = 'A'.repeat(100);
    const longLast = 'B'.repeat(100);
    const out = splitPersonName(`${longFirst} ${longLast}`);
    assert.equal(out.first.length, 80);
    assert.equal(out.last.length, 80);
  });
});

test('parseThirdPartyAddress', async (t) => {
  await t.test('empty input', () => {
    assert.deepEqual(parseThirdPartyAddress(''), { street: '', city: '', state: '', zip: '' });
    assert.deepEqual(parseThirdPartyAddress(null), { street: '', city: '', state: '', zip: '' });
  });

  await t.test('classic "street, city, STATE ZIP"', () => {
    assert.deepEqual(parseThirdPartyAddress('123 Main St, Denver, CO 80202'), {
      street: '123 Main St',
      city: 'Denver',
      state: 'CO',
      zip: '80202'
    });
  });

  await t.test('4-comma form "street, unit, city, STATE, ZIP"', () => {
    assert.deepEqual(parseThirdPartyAddress('123 Main St, Suite 200, Denver, CO, 80202'), {
      street: '123 Main St, Suite 200',
      city: 'Denver',
      state: 'CO',
      zip: '80202'
    });
  });

  await t.test('intermediate unit w/o extra comma before zip', () => {
    assert.deepEqual(parseThirdPartyAddress('123 Main St, Suite 200, Denver, CO 80202'), {
      street: '123 Main St, Suite 200',
      city: 'Denver',
      state: 'CO',
      zip: '80202'
    });
  });

  await t.test('ZIP+4', () => {
    assert.deepEqual(parseThirdPartyAddress('PO Box 500, Chicago, IL 60601-1234'), {
      street: 'PO Box 500',
      city: 'Chicago',
      state: 'IL',
      zip: '60601-1234'
    });
  });

  await t.test('lowercase state is normalized', () => {
    assert.deepEqual(parseThirdPartyAddress('123 Main St, Denver, co 80202'), {
      street: '123 Main St',
      city: 'Denver',
      state: 'CO',
      zip: '80202'
    });
  });

  await t.test('city-only with state+zip', () => {
    assert.deepEqual(parseThirdPartyAddress('Denver, CO 80202'), {
      street: '',
      city: 'Denver',
      state: 'CO',
      zip: '80202'
    });
  });

  await t.test('missing ZIP', () => {
    assert.deepEqual(parseThirdPartyAddress('456 Oak Ave, Seattle, WA'), {
      street: '456 Oak Ave',
      city: 'Seattle',
      state: 'WA',
      zip: ''
    });
  });

  await t.test('missing state and ZIP — treat whole thing as street', () => {
    assert.deepEqual(parseThirdPartyAddress('123 Main St'), {
      street: '123 Main St',
      city: '',
      state: '',
      zip: ''
    });
  });

  await t.test('street suffix "St" is NOT misread as a state', () => {
    // "123 Main St" — "ST" is not in US_STATES, so state extraction must skip it
    const result = parseThirdPartyAddress('123 Main St');
    assert.equal(result.state, '');
  });

  await t.test('extra whitespace is tolerated', () => {
    assert.deepEqual(parseThirdPartyAddress('  123 Main St ,  Denver ,  CO   80202  '), {
      street: '123 Main St',
      city: 'Denver',
      state: 'CO',
      zip: '80202'
    });
  });

  await t.test('truncates overlong street to 500 chars', () => {
    const longStreet = 'A'.repeat(800);
    const out = parseThirdPartyAddress(`${longStreet}, Denver, CO 80202`);
    assert.ok(out.street.length <= 500);
  });
});

test('parsePrevAddress uses parseThirdPartyAddress', () => {
  assert.deepEqual(parsePrevAddress('500 Old Ave, Boston, MA 02101'), {
    street: '500 Old Ave',
    city: 'Boston',
    state: 'MA',
    zip: '02101'
  });
});

test('taxFormToPdfValues', async (t) => {
  await t.test('known form codes', () => {
    assert.deepEqual(taxFormToPdfValues('1040'), ['1040', '', '']);
    assert.deepEqual(taxFormToPdfValues('1040-sr'), ['1040-SR', '', '']);
    assert.deepEqual(taxFormToPdfValues('1120'), ['1120', '', '']);
    assert.deepEqual(taxFormToPdfValues('1065'), ['1065', '', '']);
    assert.deepEqual(taxFormToPdfValues('w2'), ['W-2', '', '']);
    assert.deepEqual(taxFormToPdfValues('1099'), ['1099', '', '']);
    assert.deepEqual(taxFormToPdfValues('other'), ['', '', '']);
  });

  await t.test('unknown form falls back to 1040', () => {
    assert.deepEqual(taxFormToPdfValues('xyz-unknown'), ['1040', '', '']);
  });

  await t.test('empty falls back to 1040', () => {
    assert.deepEqual(taxFormToPdfValues(''), ['1040', '', '']);
    assert.deepEqual(taxFormToPdfValues(null), ['1040', '', '']);
  });

  await t.test('case-insensitive match', () => {
    assert.deepEqual(taxFormToPdfValues('1040-SR'), ['1040-SR', '', '']);
    assert.deepEqual(taxFormToPdfValues('W2'), ['W-2', '', '']);
  });
});

test('distributeTaxYears', async (t) => {
  const empty = { mm: '', dd: '', yyyy: '' };

  await t.test('empty input returns 4 empty slots', () => {
    assert.deepEqual(distributeTaxYears(''), [empty, empty, empty, empty]);
    assert.deepEqual(distributeTaxYears(null), [empty, empty, empty, empty]);
    assert.deepEqual(distributeTaxYears(undefined), [empty, empty, empty, empty]);
  });

  await t.test('bare year becomes 12/31 of that year', () => {
    assert.deepEqual(distributeTaxYears('2023'), [
      { mm: '12', dd: '31', yyyy: '2023' },
      empty, empty, empty
    ]);
  });

  await t.test('comma-separated years distribute across slots', () => {
    assert.deepEqual(distributeTaxYears('2021, 2022, 2023'), [
      { mm: '12', dd: '31', yyyy: '2021' },
      { mm: '12', dd: '31', yyyy: '2022' },
      { mm: '12', dd: '31', yyyy: '2023' },
      empty
    ]);
  });

  await t.test('explicit MM/DD/YYYY passes through', () => {
    assert.deepEqual(distributeTaxYears('03/15/2023'), [
      { mm: '03', dd: '15', yyyy: '2023' },
      empty, empty, empty
    ]);
  });

  await t.test('zero-pads single-digit MM and DD', () => {
    assert.deepEqual(distributeTaxYears('3/5/2023'), [
      { mm: '03', dd: '05', yyyy: '2023' },
      empty, empty, empty
    ]);
  });

  await t.test('mixes bare years and explicit dates', () => {
    assert.deepEqual(distributeTaxYears('2022, 06/30/2023'), [
      { mm: '12', dd: '31', yyyy: '2022' },
      { mm: '06', dd: '30', yyyy: '2023' },
      empty, empty
    ]);
  });

  await t.test('truncates to first 4 tokens', () => {
    const out = distributeTaxYears('2020, 2021, 2022, 2023, 2024');
    assert.equal(out.length, 4);
    assert.equal(out[0].yyyy, '2020');
    assert.equal(out[3].yyyy, '2023');
  });

  await t.test('tolerates semicolons and whitespace separators', () => {
    assert.deepEqual(distributeTaxYears('2021;  2022\t2023'), [
      { mm: '12', dd: '31', yyyy: '2021' },
      { mm: '12', dd: '31', yyyy: '2022' },
      { mm: '12', dd: '31', yyyy: '2023' },
      empty
    ]);
  });

  await t.test('silently skips unrecognized tokens', () => {
    // "or period" words and stray punctuation are ignored
    assert.deepEqual(distributeTaxYears('2022 or 2023'), [
      { mm: '12', dd: '31', yyyy: '2022' },
      { mm: '12', dd: '31', yyyy: '2023' },
      empty, empty
    ]);
  });
});

test('digitsOnly', async (t) => {
  await t.test('strips non-digits', () => {
    assert.equal(digitsOnly('123-45-6789'), '123456789');
    assert.equal(digitsOnly('(303) 555-1212', 10), '3035551212');
  });

  await t.test('enforces max length', () => {
    assert.equal(digitsOnly('123456789012345', 9), '123456789');
  });

  await t.test('empty and falsy', () => {
    assert.equal(digitsOnly(''), '');
    assert.equal(digitsOnly(null), '');
    assert.equal(digitsOnly(undefined), '');
  });
});
