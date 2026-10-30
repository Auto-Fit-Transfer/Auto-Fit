import type { RunningSession } from '@/src/api/running';

export type ActivityDay = { date: string; minutes: number; runningMinutes: number; workouts: number };
export type ExerciseHistoryEntry = { session: Record<string, unknown> };

export const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sessionLocalDate = (value: unknown) => {
  if (typeof value !== 'string') return '날짜 미기록';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '날짜 미기록' : localDayKey(date);
};
export const shiftDay = (date: Date, amount: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};
const positive = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function collectActivityDays(
  exerciseHistory: ExerciseHistoryEntry[], runningHistory: RunningSession[],
): ActivityDay[] {
  const days = new Map<string, ActivityDay>();
  const add = (date: string, minutes: number, running: boolean) => {
    if (date === '날짜 미기록') return;
    const row = days.get(date) ?? { date, minutes: 0, runningMinutes: 0, workouts: 0 };
    row.minutes += minutes;
    if (running) row.runningMinutes += minutes;
    row.workouts += 1;
    days.set(date, row);
  };
  for (const { session } of exerciseHistory) {
    if (session.status !== 'completed') continue;
    add(sessionLocalDate(session.started_at), positive(session.total_duration_seconds) / 60, false);
  }
  for (const run of runningHistory) {
    if (run.status !== 'completed') continue;
    add(sessionLocalDate(run.started_at), positive(run.elapsed_seconds) / 60, true);
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function summarizeActivity(days: ActivityDay[], from: Date, to: Date) {
  const first = localDayKey(from);
  const last = localDayKey(to);
  const included = days.filter((day) => day.date >= first && day.date <= last);
  const minutes = included.reduce((sum, day) => sum + day.minutes, 0);
  const runningMinutes = included.reduce((sum, day) => sum + day.runningMinutes, 0);
  const workouts = included.reduce((sum, day) => sum + day.workouts, 0);
  const activeDays = included.length;
  let streak = 0;
  let longestStreak = 0;
  let previous: Date | null = null;
  for (const day of included) {
    const current = new Date(`${day.date}T12:00:00`);
    streak = previous && localDayKey(shiftDay(previous, 1)) === day.date ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = current;
  }
  const bestDay = included.reduce<ActivityDay | null>((best, day) =>
    !best || day.minutes > best.minutes ? day : best, null);
  return { minutes, runningMinutes, workouts, activeDays, longestStreak, bestDay };
}

export function chartActivity(days: ActivityDay[], from: Date, to: Date, period: 'week' | 'month') {
  if (period === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = localDayKey(shiftDay(from, index));
      return { label: ['월', '화', '수', '목', '금', '토', '일'][index],
        ...days.find((day) => day.date === date) ?? { date, minutes: 0, runningMinutes: 0, workouts: 0 } };
    });
  }
  const buckets: { label: string; minutes: number; runningMinutes: number; workouts: number }[] = [];
  for (let cursor = new Date(from), index = 1; cursor <= to; cursor = shiftDay(cursor, 7), index++) {
    const end = shiftDay(cursor, 6);
    const summary = summarizeActivity(days, cursor, end > to ? to : end);
    buckets.push({ label: `${index}주`, minutes: summary.minutes,
      runningMinutes: summary.runningMinutes, workouts: summary.workouts });
  }
  return buckets;
}
