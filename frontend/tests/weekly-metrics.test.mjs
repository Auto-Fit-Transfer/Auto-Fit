import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapWeeklyMetrics,
  formatSessionDuration,
  sessionCalories,
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
test('the weekly card gets the minutes behind the percent', () => {
  const v = mapWeeklyMetrics({
    progress: {
      summary: { workout_count: 3, target_workout_count: 3, duration_minutes: 80.4, target_duration_minutes: 120, goal_achievement_rate: 83.3 },
    },
  });
  assert.equal(v.currentWeekMinutes, 80.4);
  assert.equal(v.targetMinutes, 120);
  assert.equal(v.remainingGoalMinutes, 40);
  assert.equal(mapWeeklyMetrics({ progress: { summary: { duration_minutes: 130, target_duration_minutes: 120 } } }).remainingGoalMinutes, 0);
  assert.equal(mapWeeklyMetrics(null).remainingGoalMinutes, null);
});
test('completed workouts without calorie estimates are not shown as zero kcal', () => {
  assert.equal(sessionCalories(0, 4), null);
  assert.equal(sessionCalories('0', '1'), null);
  assert.equal(sessionCalories(120, 4), 120);
  assert.equal(sessionCalories(0, 0), 0);
  assert.equal(sessionCalories(null, 4), null);
});
test('result duration uses recorded fractional minutes without placeholder values', () => {
  assert.equal(formatSessionDuration(35.5), '35:30');
  assert.equal(formatSessionDuration(35), '35:00');
  assert.equal(formatSessionDuration(null), '—');
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
