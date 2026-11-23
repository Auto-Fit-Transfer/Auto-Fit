import assert from 'node:assert/strict';
import test from 'node:test';

import { activeRecommendation, closedPlan } from '../src/features/exercise/exerciseData.ts';

test('a stopped, completed or skipped day is not offered again; a planned or running one is', () => {
  for (const status of ['completed', 'skipped', 'stopped']) assert.equal(closedPlan(status), true, status);
  for (const status of ['planned', 'in_progress']) assert.equal(closedPlan(status), false, status);
});

test('only an active recommendation can be started (the server says 409 otherwise)', () => {
  assert.equal(activeRecommendation('active'), true);
  assert.equal(activeRecommendation('completed'), false);
  assert.equal(activeRecommendation('cancelled'), false);
  assert.equal(activeRecommendation(null), true, 'no status sent: the server decides');
});
