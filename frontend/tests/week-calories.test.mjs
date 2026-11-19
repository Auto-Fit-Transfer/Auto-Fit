import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWeekCalories, weekKeys } from '../src/features/diet/weekCalories.ts';

const summary = (date, consumed, target = 1700) => ({ date, calories: { consumed, target, unit: 'kcal' } });

test('a week is the seven days from Monday', () => {
  assert.deepEqual(weekKeys('2026-11-16'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
});

test('the one weekly call is used when the server has it', async () => {
  let daily = 0;
  const days = weekKeys('2026-11-16').map((date, index) => summary(date, index < 3 ? 1200 + index : 0));
  const week = await loadWeekCalories('2026-11-16', '2026-11-19', async () => ({ days }), async () => { daily += 1; return { summary: null }; });
  assert.equal(daily, 0);
  assert.deepEqual(week.map((item) => item.kcal), [1200, 1201, 1202, 0, 0, 0, 0]);
  assert.equal(week[0].target, 1700);
});

test('an older server is asked day by day, never for days to come', async () => {
  const asked = [];
  const week = await loadWeekCalories(
    '2026-11-16',
    '2026-11-18',
    async () => { throw new Error('404'); },
    async (date) => { asked.push(date); if (date === '2026-11-17') throw new Error('500'); return { summary: summary(date, '480') }; },
  );
  assert.deepEqual(asked, ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.deepEqual(week.map((item) => item.kcal), [480, null, 480, null, null, null, null]);
});
