// Preserve the server's combined frequency/time achievement calculation.
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function mapWeeklyMetrics(response: unknown) {
  const progress = record(record(response).progress),
    summary = record(progress.summary),
    achievements = record(progress.achievements);
  const completed = number(summary.workout_count),
    target = number(summary.target_workout_count);
  return {
    currentWorkoutStreakDays: number(achievements.longest_workout_streak_days),
    currentWeekWorkoutCount: completed,
    targetWorkoutCount: target,
    goalAchievementRate: number(summary.goal_achievement_rate),
    remainingGoalWorkoutCount:
      target !== null && completed !== null ? Math.max(0, target - completed) : null,
  };
}
export function sessionMinutes(value: unknown) {
  const seconds = number(value);
  return seconds === null ? null : Math.round(seconds / 6) / 10;
}
export function sessionLocalDate(value: unknown) {
  if (typeof value !== 'string') return '날짜 미기록';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '날짜 미기록';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
