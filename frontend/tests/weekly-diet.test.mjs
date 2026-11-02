import assert from 'node:assert/strict';
import test from 'node:test';
import { getKstDateKey, getWeekStartDate, getWeeklyMealsForDate } from '../src/features/diet/weeklyRecommendations.ts';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

test('selected dates resolve to the Monday of their own week, including year boundaries', () => {
  assert.equal(getWeekStartDate('2026-11-02'), '2026-11-02');
  assert.equal(getWeekStartDate('2026-11-08'), '2026-11-02');
  assert.equal(getWeekStartDate('2027-01-01'), '2026-12-28');
});

test('the selected calendar day follows the backend Asia/Seoul timezone', () => {
  assert.equal(getKstDateKey(new Date('2026-11-01T15:30:00Z')), '2026-11-02');
});

test('the selected date reads its four meals from a full seven-day response', () => {
  const weeklyPlan = {
    result: {
      weekly_plan: days.map((day, index) => ({
        day,
        date: `2026-11-0${index + 2}`,
        meals: Object.fromEntries(mealTypes.map((type) => [type, { menu_name: `${day}-${type}` }])),
      })),
    },
  };
  assert.equal(weeklyPlan.result.weekly_plan.flatMap((day) => Object.values(day.meals)).length, 28);
  assert.deepEqual(
    getWeeklyMealsForDate(weeklyPlan, '2026-11-05')?.map(([type, meal]) => [type, meal.menu_name]),
    mealTypes.map((type) => [type, `thursday-${type}`]),
  );
  assert.equal(getWeeklyMealsForDate(weeklyPlan, '2026-11-09'), null);
});
