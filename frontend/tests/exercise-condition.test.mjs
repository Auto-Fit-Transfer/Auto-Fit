import assert from 'node:assert/strict';
import test from 'node:test';
import { mapPersistedExerciseCondition } from '../src/features/exercise/exerciseCondition.ts';

const recommendationId = 'recommendation-1';

test('restores the equipment selected for the displayed recommendation', () => {
  const condition = mapPersistedExerciseCondition(
    {
      result: {
        context: {
          exercise_recommendation_id: recommendationId,
          available_minutes: 45,
          location: 'gym',
          available_equipment: ['machine', 'mat'],
          condition_level: '보통',
          discomfort_areas: [],
        },
      },
    },
    recommendationId,
  );

  assert.deepEqual(condition, {
    availableMinutes: 45,
    location: 'gym',
    equipment: ['machine', 'bodyweight'],
    condition: '보통',
    discomfortArea: '',
  });
});

test('does not show a newer failed request as the saved recommendation condition', () => {
  const response = {
    result: {
      context: {
        exercise_recommendation_id: null,
        available_minutes: 45,
        location: 'gym',
        available_equipment: ['machine'],
        condition_level: '보통',
        discomfort_areas: [],
      },
    },
  };
  assert.equal(mapPersistedExerciseCondition(response, recommendationId), null);
  response.result.context.exercise_recommendation_id = 'different-recommendation';
  assert.equal(mapPersistedExerciseCondition(response, recommendationId), null);
});

test('preserves an intentional no-equipment choice', () => {
  const condition = mapPersistedExerciseCondition(
    {
      result: {
        context: {
          exercise_recommendation_id: recommendationId,
          available_minutes: 30,
          location: 'home',
          available_equipment: [],
          condition_level: '좋음',
          discomfort_areas: [],
        },
      },
    },
    recommendationId,
  );
  assert.deepEqual(condition?.equipment, []);
  assert.equal(
    mapPersistedExerciseCondition({ result: { context: null } }, recommendationId),
    null,
  );
});
