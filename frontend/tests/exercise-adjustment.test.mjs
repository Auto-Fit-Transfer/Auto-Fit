import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAdjustedExercises } from '../src/features/exercise/exerciseAdjustment.ts';

test('adjustment changes only later exercises and their active targets', () => {
  const exercises = [
    {
      id: 'current',
      mode: 'timed',
      targetSeconds: 300,
      targetRepetitions: null,
      totalSets: 1,
      durationMinutes: 5,
      sets: null,
      repetitions: null,
      intensity: 'low',
      caloriesBurned: 10,
    },
    {
      id: 'next',
      mode: 'timed',
      targetSeconds: 600,
      targetRepetitions: null,
      totalSets: 1,
      durationMinutes: 10,
      sets: null,
      repetitions: null,
      intensity: 'moderate',
      caloriesBurned: 40,
    },
    {
      id: 'last',
      mode: 'reps',
      targetSeconds: null,
      targetRepetitions: 12,
      totalSets: 3,
      durationMinutes: 10,
      sets: 3,
      repetitions: 12,
      intensity: 'high',
      caloriesBurned: 60,
    },
  ];
  const adjusted = [
    { exercise_item_id: 'current', target_duration_seconds: 1 },
    {
      exercise_item_id: 'next',
      target_duration_seconds: 480,
      duration_minutes: 8,
      intensity: 'low',
      calories_burned: 32,
    },
    {
      exercise_item_id: 'last',
      sets: 2,
      repetitions: 10,
      duration_minutes: 8,
      intensity: 'moderate',
      calories_burned: 48,
    },
  ];

  const merged = mergeAdjustedExercises(exercises, 0, adjusted);
  assert.equal(merged[0], exercises[0]);
  assert.equal(merged[1].targetSeconds, 480);
  assert.equal(merged[1].durationMinutes, 8);
  assert.equal(merged[2].targetRepetitions, 10);
  assert.equal(merged[2].totalSets, 2);
  assert.equal(merged[2].intensity, 'moderate');
});
