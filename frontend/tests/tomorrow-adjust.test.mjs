import assert from 'node:assert/strict';
import test from 'node:test';
import { plannedCuts } from '../src/features/diet/tomorrowAdjust.ts';

test('what went over is shared evenly while every meal stays within 15%', () => {
  assert.deepEqual(plannedCuts(200, [560, 540]), [84, 81]); // 100 each asked, 15% caps them
  assert.deepEqual(plannedCuts(100, [560, 540]), [50, 50]); // small enough to share fully
  assert.deepEqual(plannedCuts(200, [180]), [27]); // a snack can give up little
});

test('nothing picked or nothing over cuts nothing', () => {
  assert.deepEqual(plannedCuts(200, []), []);
  assert.deepEqual(plannedCuts(0, [500]), [0]);
});
