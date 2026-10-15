export type NutritionMetric = {
  consumed: number | string | null;
  target: number | string | null;
  unit: string;
};
export type NutritionSummary = {
  date: string;
  has_unknown_items: boolean;
  has_recommendation: boolean;
  calories: NutritionMetric;
  carbohydrates: NutritionMetric;
  protein: NutritionMetric;
  fat: NutritionMetric;
};

export function nutritionNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
