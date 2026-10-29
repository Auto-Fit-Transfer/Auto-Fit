import assert from 'node:assert/strict';
import test from 'node:test';
import {
  koreanDateLabel,
  localDateKey,
  mondayOf,
  summarizeWeek,
  sundayOf,
} from '../src/features/home/homeSummary.ts';

test('date label and week range follow a Monday-first week', () => {
  const sunday = new Date(2025, 9, 26, 9, 0);
  assert.equal(koreanDateLabel(sunday), '10월 26일 일요일');
  assert.equal(localDateKey(mondayOf(sunday)), '2025-10-20');
  assert.equal(localDateKey(sundayOf(sunday)), '2025-10-26');
});

test('only finished workouts of this week are marked', () => {
  const today = new Date(2025, 9, 26, 9, 0);
  const history = [
    {
      session: {
        status: 'completed',
        started_at: '2025-10-20T08:00:00',
        total_duration_seconds: 2400,
      },
    },
    {
      session: {
        status: 'completed',
        started_at: '2025-10-22T19:00:00',
        total_duration_seconds: 2700,
      },
    },
    { session: { status: 'started', started_at: '2025-10-23T19:00:00' } },
    {
      session: {
        status: 'completed',
        started_at: '2025-10-18T19:00:00',
        total_duration_seconds: 600,
      },
    },
  ];
  const { doneDays, minutes } = summarizeWeek(history, today);
  assert.deepEqual(doneDays, [true, false, true, false, false, false, false]);
  assert.equal(minutes, 85);
});

test('no recorded duration shows as unknown, not zero', () => {
  const today = new Date(2025, 9, 26, 9, 0);
  const history = [{ session: { status: 'completed', started_at: '2025-10-21T08:00:00' } }];
  assert.equal(summarizeWeek(history, today).minutes, null);
});
