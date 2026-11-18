import assert from 'node:assert/strict';
import test from 'node:test';
import { earnsWorkoutPoints, pointsOutcome, refusalOutcome } from '../src/features/exercise/workoutPoints.ts';

const move = (over) => ({ completed: true, completedSets: 1, elapsedSeconds: 90, ...over });

test('+5 is asked for only when one move is completed with a set and at least 1 recorded minute', () => {
  assert.equal(earnsWorkoutPoints([move({})]), true);
  assert.equal(earnsWorkoutPoints([move({ elapsedSeconds: 20 })]), false, '0 minutes, 1 set');
  assert.equal(earnsWorkoutPoints([move({ completedSets: 0, elapsedSeconds: 70 })]), false, '1 minute, 0 sets');
  assert.equal(earnsWorkoutPoints([move({ completed: false, elapsedSeconds: 70 })]), false, 'a move stopped half way');
  assert.equal(earnsWorkoutPoints([move({ elapsedSeconds: 30 })]), true, '30 s is recorded as 1 minute');
  assert.equal(earnsWorkoutPoints([]), false);
});

test('a set on one move and a minute on another do not add up (the server checks each move)', () => {
  const a = move({ completedSets: 1, elapsedSeconds: 20 }); // 1 set, 0 minutes
  const b = move({ completed: false, completedSets: 0, elapsedSeconds: 70 }); // 0 sets, 1 minute
  assert.equal(earnsWorkoutPoints([a, b]), false);
  assert.equal(earnsWorkoutPoints([a, b, move({})]), true, 'a third move that meets both');
});

test('only a real refusal says no points', () => {
  assert.equal(pointsOutcome({ awarded: true, reason: 'awarded' }), 'awarded');
  assert.equal(pointsOutcome({ awarded: false, reason: 'already_awarded' }), 'awarded');
  assert.equal(pointsOutcome({ awarded: false, reason: 'period_limit' }), 'not_awarded');
});

test('a 409 TIER_SOURCE_INCOMPLETE is a refusal; a network or other server error is not', () => {
  assert.equal(refusalOutcome({ status: 409, detail: { code: 'TIER_SOURCE_INCOMPLETE' } }), 'not_awarded');
  assert.equal(refusalOutcome({ status: 0, detail: undefined }), null, 'no network');
  assert.equal(refusalOutcome({ status: 502, detail: { code: 'HABIT_TIER_UNAVAILABLE' } }), null);
  assert.equal(refusalOutcome({ status: 404, detail: { code: 'TIER_SOURCE_NOT_FOUND' } }), null);
  assert.equal(refusalOutcome({ status: 409, detail: { code: 'SOMETHING_ELSE' } }), null);
  assert.equal(refusalOutcome(null), null);
});
