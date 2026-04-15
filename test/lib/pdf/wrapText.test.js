'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { wrapTextToLines } = require('../../../lib/pdf/wrapText');

/** Fake monospace font: every glyph is 6pt wide at 12pt. */
function fakeFont(charWidth = 0.5) {
  return {
    widthOfTextAtSize(text, size) {
      return String(text).length * charWidth * size;
    }
  };
}

test('wrapTextToLines', async (t) => {
  await t.test('empty and falsy input yields single empty line', () => {
    assert.deepEqual(wrapTextToLines('', 100, fakeFont(), 12), ['']);
    assert.deepEqual(wrapTextToLines(null, 100, fakeFont(), 12), ['']);
    assert.deepEqual(wrapTextToLines(undefined, 100, fakeFont(), 12), ['']);
  });

  await t.test('text that fits on one line is not wrapped', () => {
    const lines = wrapTextToLines('hi there', 1000, fakeFont(), 12);
    assert.deepEqual(lines, ['hi there']);
  });

  await t.test('wraps on word boundaries when line is full', () => {
    // Each char = 6pt at size 12. "hello " is 6*6 = 36; "world" is 5*6 = 30. Total with space 66.
    // width 40 pt fits "hello" (30) but not "hello world" (66). Next word goes to new line.
    const lines = wrapTextToLines('hello world', 40, fakeFont(), 12);
    assert.deepEqual(lines, ['hello', 'world']);
  });

  await t.test('respects explicit newlines in input', () => {
    const lines = wrapTextToLines('line one\nline two', 1000, fakeFont(), 12);
    assert.deepEqual(lines, ['line one', 'line two']);
  });

  await t.test('normalizes CRLF to LF', () => {
    const lines = wrapTextToLines('line one\r\nline two', 1000, fakeFont(), 12);
    assert.deepEqual(lines, ['line one', 'line two']);
  });

  await t.test('hard-breaks a word longer than maxWidth', () => {
    // "supercalifragilistic" = 20 chars = 120pt. maxWidth 30pt fits 5 chars per chunk.
    const lines = wrapTextToLines('supercalifragilistic', 30, fakeFont(), 12);
    // Each chunk is 5 chars at 6pt each = 30pt (≤ 30pt). Joined result is the original.
    assert.equal(lines.join(''), 'supercalifragilistic');
    lines.forEach((l) => assert.ok(l.length > 0));
  });

  await t.test('preserves blank lines from double newlines', () => {
    const lines = wrapTextToLines('one\n\nthree', 1000, fakeFont(), 12);
    assert.deepEqual(lines, ['one', '', 'three']);
  });
});
