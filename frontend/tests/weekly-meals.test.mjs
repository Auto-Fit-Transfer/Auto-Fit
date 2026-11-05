import assert from 'node:assert/strict';
import test from 'node:test';
import { weekStartOf, weeklyDayFor } from '../src/features/diet/weeklyMeals.ts';

test('every day of a week belongs to its Monday', () => {
  assert.equal(weekStartOf('2026-11-02'), '2026-11-02');
  assert.equal(weekStartOf('2026-11-05'), '2026-11-02');
  assert.equal(weekStartOf('2026-11-08'), '2026-11-02');
  assert.equal(weekStartOf('2026-11-09'), '2026-11-09');
  assert.equal(weekStartOf('2026-11-01'), '2026-10-26');
});

test('a saved week only answers for its own dates', () => {
  const friday = { day: 'friday', date: '2026-11-06', meals: {} };
  const plan = { result: { weekly_plan: [{ day: 'monday', date: '2026-11-02', meals: {} }, friday] } };
  assert.equal(weeklyDayFor(plan, '2026-11-06'), friday);
  assert.equal(weeklyDayFor(plan, '2026-11-09'), null);
  assert.equal(weeklyDayFor(null, '2026-11-06'), null);
});
