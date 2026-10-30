import assert from 'node:assert/strict';
import test from 'node:test';
import { chartActivity, collectActivityDays, summarizeActivity } from '../src/features/exercise/goalProgress.ts';

test('goal progress combines only completed exercise and running sessions', () => {
  const exercises = [
    { session: { status: 'completed', started_at: '2026-10-26T12:00:00', total_duration_seconds: 1800 } },
    { session: { status: 'stopped', started_at: '2026-10-26T12:00:00', total_duration_seconds: 3600 } },
    { session: { status: 'completed', started_at: '2026-10-27T12:00:00', total_duration_seconds: 900 } },
  ];
  const runs = [
    { status: 'completed', started_at: '2026-10-26T13:00:00', elapsed_seconds: 1200 },
    { status: 'discarded', started_at: '2026-10-27T13:00:00', elapsed_seconds: 1200 },
  ];
  const days = collectActivityDays(exercises, runs);
  assert.deepEqual(days.map(({ date, minutes, runningMinutes, workouts }) => ({ date, minutes, runningMinutes, workouts })), [
    { date: '2026-10-26', minutes: 50, runningMinutes: 20, workouts: 2 },
    { date: '2026-10-27', minutes: 15, runningMinutes: 0, workouts: 1 },
  ]);
  const summary = summarizeActivity(days, new Date('2026-10-26T12:00:00'), new Date('2026-11-01T12:00:00'));
  assert.equal(summary.minutes, 65);
  assert.equal(summary.workouts, 3);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.longestStreak, 2);
  assert.equal(chartActivity(days, new Date('2026-10-26T12:00:00'), new Date('2026-11-01T12:00:00'), 'week')[0].minutes, 50);
});
