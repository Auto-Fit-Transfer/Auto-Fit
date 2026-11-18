import assert from 'node:assert/strict';
import test from 'node:test';
import { earnsWorkoutPoints, pointsOutcome } from '../src/features/exercise/workoutPoints.ts';

const move = (over) => ({ completed: true, completedSets: 1, elapsedSeconds: 90, ...over });

test('+5 is asked for only when a completed move has a set and the recorded minutes are over 0', () => {
  assert.equal(earnsWorkoutPoints([move({})]), true);
  assert.equal(earnsWorkoutPoints([move({ elapsedSeconds: 20 })]), false, '0 minutes, 1 set');
  assert.equal(earnsWorkoutPoints([move({ completedSets: 0, elapsedSeconds: 70 })]), false, '1 minute, 0 sets');
  assert.equal(earnsWorkoutPoints([move({ completed: false, elapsedSeconds: 70 })]), false, 'a move stopped half way');
  assert.equal(earnsWorkoutPoints([move({ elapsedSeconds: 20 }), move({ completed: false, completedSets: 0, elapsedSeconds: 20 })]), false, 'two 20 s moves are recorded as 0 + 0 minutes');
  assert.equal(earnsWorkoutPoints([move({ elapsedSeconds: 30 })]), true, '30 s is recorded as 1 minute');
  assert.equal(earnsWorkoutPoints([]), false);
});

test('only a real refusal says no points', () => {
  assert.equal(pointsOutcome({ awarded: true, reason: 'awarded' }), 'awarded');
  assert.equal(pointsOutcome({ awarded: false, reason: 'already_awarded' }), 'awarded');
  assert.equal(pointsOutcome({ awarded: false, reason: 'period_limit' }), 'not_awarded');
});
