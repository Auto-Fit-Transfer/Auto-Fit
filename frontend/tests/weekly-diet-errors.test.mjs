import assert from 'node:assert/strict';
import test from 'node:test';
import { weeklyDietErrorCode, weeklyDietErrorMessage } from '../src/features/diet/weeklyDietErrors.ts';

test('503 causes are told apart by the server code', () => {
  assert.match(weeklyDietErrorMessage({ code: 'AI_TIMEOUT' }), /잠시 응답하지/);
  assert.match(weeklyDietErrorMessage({ code: 'AI_FOOD_RESTRICTION_CONFLICT' }), /안전을 위해/);
  assert.notEqual(
    weeklyDietErrorMessage({ code: 'AI_TIMEOUT' }),
    weeklyDietErrorMessage({ code: 'WEEKLY_DIET_STORAGE_ERROR' }),
  );
});

test('unknown or missing codes fall back to the existing message', () => {
  assert.equal(weeklyDietErrorMessage({ code: 'SOMETHING_NEW' }), null);
  assert.equal(weeklyDietErrorMessage('plain text'), null);
  assert.equal(weeklyDietErrorMessage(undefined), null);
  assert.equal(weeklyDietErrorCode({ code: 'WEEKLY_DIET_NOT_FOUND' }), 'WEEKLY_DIET_NOT_FOUND');
});
