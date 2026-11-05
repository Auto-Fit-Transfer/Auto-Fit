import type { WeeklyPlan } from '@/src/api/diet';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

// The server keeps one plan per week, always starting on Monday.
export function weekStartOf(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function weeklyDayFor(plan: WeeklyPlan | null, dateKey: string) {
  return plan?.result.weekly_plan.find((entry) => entry.date === dateKey) ?? null;
}

// Every screen shows the same menu for a date and meal. A daily meal wins because recording needs its id.
export function mergeDayMeals<T extends { id: string }>(daily: T[], weekly: T[]) {
  return MEAL_ORDER.flatMap((id): T[] => {
    const meal = daily.find((item) => item.id === id) ?? weekly.find((item) => item.id === id);
    return meal ? [meal] : [];
  });
}
