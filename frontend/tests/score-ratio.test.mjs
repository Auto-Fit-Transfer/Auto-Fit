import assert from 'node:assert/strict';
import test from 'node:test';
import { getScoreRatio } from '../src/components/home/scoreRatio.ts';

test('health ring tracks the actual score instead of a fixed example', () => {
  assert.equal(getScoreRatio(24, 100), 0.24);
  assert.equal(getScoreRatio(86, 100), 0.86);
  assert.equal(getScoreRatio(40, 50), 0.8);
});
test('empty, invalid and out-of-range values cannot produce an invalid arc', () => {
  for (const [score, total] of [
    [null, 100],
    [10, null],
    [10, 0],
    [NaN, 100],
    [10, Infinity],
    [-10, 100],
  ]) {
    assert.equal(getScoreRatio(score, total), 0);
  }
  assert.equal(getScoreRatio(150, 100), 1);
});
