import type { WeeklyPlan } from '@/src/api/diet';

// The server keeps one plan per week, always starting on Monday.
export function weekStartOf(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function weeklyDayFor(plan: WeeklyPlan | null, dateKey: string) {
  return plan?.result.weekly_plan.find((entry) => entry.date === dateKey) ?? null;
}
