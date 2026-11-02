import type { WeeklyDietMeal, WeeklyDietPlanResponse, WeeklyMealType } from '@/src/api/diet';

const mealTypes: WeeklyMealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function getKstDateKey(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function getWeekStartDate(dateKey: string): string {
  // Date-only values are interpreted in UTC so the same week is selected in every device timezone.
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function getWeeklyMealsForDate(
  plan: Pick<WeeklyDietPlanResponse, 'result'>,
  dateKey: string,
): [WeeklyMealType, WeeklyDietMeal][] | null {
  const day = plan.result.weekly_plan.find((entry) => entry.date === dateKey);
  if (!day || mealTypes.some((type) => !day.meals[type])) return null;
  return mealTypes.map((type) => [type, day.meals[type]]);
}
