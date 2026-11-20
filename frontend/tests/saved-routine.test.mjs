import assert from 'node:assert/strict';
import test from 'node:test';
import { itemMinutes, recordedItemIds } from '../src/features/exercise/savedRoutine.ts';

test('a saved routine opened again skips the moves it already recorded', () => {
  const ids = recordedItemIds([
    { saved_routine_session_item_id: 'a', completed: true },
    { saved_routine_session_item_id: 'b', skipped: true },
    { exercise_item_id: 'c' }, // a recommended-workout log has no saved item id
    null,
  ]);
  assert.deepEqual([...ids], ['a', 'b']);
});

test('a finished move in a saved routine is sent as at least 1 minute; the recommended workout keeps 0', () => {
  assert.equal(itemMinutes(20, true, true), 1, 'the server refuses 0 for a saved routine');
  assert.equal(itemMinutes(20, true, false), 0);
  assert.equal(itemMinutes(20, false, true), 0, 'a skipped or stopped move keeps its own time');
  assert.equal(itemMinutes(150, true, true), 3);
});
