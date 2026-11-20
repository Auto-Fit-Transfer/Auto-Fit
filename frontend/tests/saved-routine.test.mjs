import assert from 'node:assert/strict';
import test from 'node:test';
import { msToFirstMinute, recordedItemIds } from '../src/features/exercise/savedRoutine.ts';

test('a saved routine opened again skips the moves it already recorded', () => {
  const ids = recordedItemIds([
    { saved_routine_session_item_id: 'a', completed: true },
    { saved_routine_session_item_id: 'b', skipped: true },
    { exercise_item_id: 'c' }, // a recommended-workout log has no saved item id
    null,
  ]);
  assert.deepEqual([...ids], ['a', 'b']);
});

test('a saved-routine move finishes only once it rounds to 1 minute; the recommended workout never waits', () => {
  assert.equal(msToFirstMinute(true, 20_000), 10_000);
  assert.equal(msToFirstMinute(true, 30_000), 0, '30 s is recorded as 1 minute');
  assert.equal(msToFirstMinute(true, 95_000), 0);
  assert.equal(msToFirstMinute(false, 5_000), 0);
});
