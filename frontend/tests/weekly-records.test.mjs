import assert from 'node:assert/strict';
import test from 'node:test';
import { previewPlan, weeklyStatuses } from '../src/features/diet/weeklyRecords.ts';

const record = (plan_day, meal_type, feedback_type) => ({ plan_day, meal_type, feedback_type, meal_log_id: null, recorded_at: '' });

test('only the shown day counts, and a meal recorded in the daily app is locked', () => {
  const { statuses, recorded, locked } = weeklyStatuses(
    'thursday',
    [record('thursday', 'lunch', 'different_food'), record('friday', 'lunch', 'eaten')],
    [record('thursday', 'breakfast', 'eaten')],
  );
  assert.deepEqual(statuses, { breakfast: 'eaten', lunch: 'modified' });
  assert.deepEqual([...recorded], ['lunch']);
  assert.deepEqual([...locked], ['breakfast']);
});

test('the preview shows the new menu only where it is ready, and no save without a preview id', () => {
  const meal = (meal_type, status, before, after) => ({ meal_type, status, before, after });
  const plan = previewPlan({
    preview_id: null,
    failed_meal_types: ['dinner'],
    tomorrow: {
      actual_reduction_kcal: 84.4, daily_target_kcal: 1700, unapplied_reduction_kcal: 115.6, total_after_kcal: 1615.6,
      meals: [
        meal('lunch', 'ready', { menu_name: '현미밥', estimated_calories_kcal: 560 }, { menu_name: '현미밥 반', estimated_calories_kcal: 476 }),
        meal('dinner', 'unavailable', { menu_name: '두부', estimated_calories_kcal: 540 }, null),
      ],
    },
  }, { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' });
  assert.deepEqual(plan.meals, [
    { slot: '점심', menu: '현미밥 반', kcal: 476, changed: true },
    { slot: '저녁', menu: '두부', kcal: 540, changed: false },
  ]);
  assert.equal(plan.cut, 84);
  assert.equal(plan.failed, 1);
  assert.equal(plan.canSave, false);
});
