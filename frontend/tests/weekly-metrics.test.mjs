import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapWeeklyMetrics,
  sessionMinutes,
  sessionLocalDate,
} from '../src/features/exercise/weeklyMetrics.ts';
test('weekly achievement preserves server frequency and duration weighting', () => {
  const v = mapWeeklyMetrics({
    progress: {
      summary: { workout_count: 3, target_workout_count: 3, goal_achievement_rate: 75 },
      achievements: { longest_workout_streak_days: 2 },
    },
  });
  assert.equal(v.goalAchievementRate, 75);
  assert.equal(v.remainingGoalWorkoutCount, 0);
  assert.equal(v.targetWorkoutCount, 3);
});
test('over-target completion does not raise the target and missing data is not zero', () => {
  const v = mapWeeklyMetrics({
    progress: {
      summary: { workout_count: 4, target_workout_count: 3, goal_achievement_rate: 100 },
    },
  });
  assert.equal(v.targetWorkoutCount, 3);
  assert.equal(v.remainingGoalWorkoutCount, 0);
  assert.equal(mapWeeklyMetrics(null).goalAchievementRate, null);
  assert.equal(
    mapWeeklyMetrics({ progress: { summary: { workout_count: 0 } } }).currentWeekWorkoutCount,
    0,
  );
});
test('history duration uses seconds and dates use device timezone', () => {
  assert.equal(sessionMinutes(1800), 30);
  assert.equal(sessionMinutes(null), null);
  assert.equal(sessionMinutes(0), 0);
  assert.equal(sessionMinutes(-1), null);
  const iso = '2026-10-14T23:30:00Z',
    d = new Date(iso);
  assert.equal(
    sessionLocalDate(iso),
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  );
  assert.equal(sessionLocalDate('bad'), '날짜 미기록');
});
