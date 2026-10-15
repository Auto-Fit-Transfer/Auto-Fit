import assert from 'node:assert/strict';
import test from 'node:test';
import { nutritionNumber } from '../src/features/nutritionSummary.ts';

test('nutrition values preserve zero and numeric API strings', () => {
  assert.equal(nutritionNumber(0), 0);
  assert.equal(nutritionNumber('165.5'), 165.5);
  for (const value of [null, undefined, '', 'unknown', NaN, Infinity, -1, true]) {
    assert.equal(nutritionNumber(value), null);
  }
});
