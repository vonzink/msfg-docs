'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('application summary email payload does not include declarations sections', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../../public/js/documents/application-summary.js'),
    'utf8'
  );
  const emailStart = source.indexOf('function buildEmailData()');
  const sessionStart = source.indexOf('function buildSessionData()');

  assert.notEqual(emailStart, -1);
  assert.notEqual(sessionStart, -1);
  assert.doesNotMatch(source.slice(emailStart, sessionStart), /declarations/i);
  assert.match(source.slice(sessionStart), /declarations/i);
});
