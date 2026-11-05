import assert from 'node:assert/strict';
import test from 'node:test';
import { scaleForFontStep, scaleText } from '../src/theme/easyMode.ts';

test('step 3 keeps the design size', () => {
  const style = { fontSize: 16, lineHeight: 24 };
  assert.equal(scaleForFontStep(style, 3), style);
});

test('larger steps grow the text and its line height together', () => {
  assert.deepEqual(scaleForFontStep({ fontSize: 16, lineHeight: 24 }, 5), { fontSize: 19, lineHeight: 29 });
  assert.equal(scaleForFontStep({ fontSize: 14 }, 4).fontSize, 15);
});

test('smaller steps never go below the smallest text size', () => {
  assert.equal(scaleForFontStep({ fontSize: 12 }, 1).fontSize, 12);
  assert.equal(scaleForFontStep({ fontSize: 14 }, 1).fontSize, 13);
  assert.equal(scaleForFontStep({ fontSize: 16 }, 2).fontSize, 15);
});

test('text without its own size is left to inherit', () => {
  const style = { color: 'red' };
  assert.equal(scaleForFontStep(style, 5), style);
});

test('the easy mode keeps its own sizes whatever the step is', () => {
  assert.equal(scaleText({ fontSize: 16 }, true, 5).fontSize, 20);
  assert.equal(scaleText({ fontSize: 16 }, true, 1).fontSize, 20);
  assert.equal(scaleText({ fontSize: 16 }, false, 5).fontSize, 19);
});
