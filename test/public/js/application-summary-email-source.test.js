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

  assert.doesNotMatch(source, /heading:\s*'Declarations - '/);
});
