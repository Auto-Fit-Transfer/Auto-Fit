import type { NutritionSummary } from '@/src/features/nutritionSummary';

// A week of eaten calories for the diet tab's "이번 주" bars (a-diet.html).
export type DayCalories = { date: string; kcal: number | null; target: number | null };
type Week = (start: string) => Promise<{ days: NutritionSummary[] }>;
type Day = (date: string) => Promise<{ summary: NutritionSummary }>;

const amount = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const pick = (summary: NutritionSummary | null | undefined) => ({
  kcal: amount(summary?.calories?.consumed),
  target: amount(summary?.calories?.target),
});

export function weekKeys(start: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

// One call for the week (back-end 2d19a51, /api/diet/summary/weekly). A server without it is asked day by
// day instead, and only up to today: a day to come has nothing eaten yet.
export async function loadWeekCalories(start: string, today: string, week: Week, day: Day): Promise<DayCalories[]> {
  const keys = weekKeys(start);
  try {
    const { days } = await week(start);
    if (Array.isArray(days) && days.length === 7) {
      return keys.map((date, index) => ({ date, ...pick(days.find((item) => item?.date === date) ?? days[index]) }));
    }
  } catch {
    // the older server: fall through to the days one by one
  }
  const found = await Promise.all(keys.map((date) => (date > today ? null : day(date).then((response) => response.summary, () => null))));
  return keys.map((date, index) => ({ date, ...pick(found[index]) }));
}
