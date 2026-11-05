import assert from 'node:assert/strict';
import test from 'node:test';
import { canSaveRecommendedHistorySession } from '../src/features/exercise/historyActions.ts';

const completed = { status: 'completed', exercise_recommendation_id: 'recommendation-1' };

test('only completed AI recommendations expose the save action', () => {
  assert.equal(canSaveRecommendedHistorySession({ ...completed, recommendation_generator: 'auto-fit-ai' }), true);
  assert.equal(canSaveRecommendedHistorySession({ ...completed, recommendation_generator: 'legacy' }), false);
  assert.equal(canSaveRecommendedHistorySession({ ...completed, recommendation_generator: null }), false);
  assert.equal(canSaveRecommendedHistorySession({ ...completed }), false);
});

test('incomplete and unlinked sessions cannot save a recommendation', () => {
  assert.equal(canSaveRecommendedHistorySession({ ...completed, status: 'stopped', recommendation_generator: 'auto-fit-ai' }), false);
  assert.equal(canSaveRecommendedHistorySession({ ...completed, exercise_recommendation_id: null, recommendation_generator: 'auto-fit-ai' }), false);
  assert.equal(canSaveRecommendedHistorySession({ ...completed, exercise_recommendation_id: ' ', recommendation_generator: 'auto-fit-ai' }), false);
});
