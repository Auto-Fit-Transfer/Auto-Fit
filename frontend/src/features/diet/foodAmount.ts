import type { RecordedFood } from '@/src/components/diet/MealRecordSheets';

export const scaleFoodToAmount = (food: RecordedFood, amount: number): RecordedFood => {
  const safeAmount = Math.max(0, Math.round(amount));
  const previousAmount = Math.max(1, food.amount || food.baseAmount || 1);
  const ratio = safeAmount / previousAmount;
  const scale = (value?: number) =>
    value === undefined ? undefined : Math.max(0, Math.round(value * ratio * 10) / 10);

  return {
    ...food,
    amount: safeAmount,
    serving: Math.round((safeAmount / Math.max(1, food.baseAmount ?? 300)) * 10) / 10,
    kcal: scale(food.kcal),
    carbs: scale(food.carbs),
    protein: scale(food.protein),
    fat: scale(food.fat),
  };
};

export type AmountScale = { from: RecordedFood; emitted: RecordedFood };

// Typing 150 passes through 1, where rounding would zero small nutrition values for good, so every change
// scales from the food as it was before the amount changed. Any other change to the food starts a new source.
export function scaleFromSource(last: AmountScale | null, food: RecordedFood, amount: number): AmountScale {
  const from = last?.emitted === food ? last.from : food;
  return { from, emitted: scaleFoodToAmount(from, amount) };
}

// Whole numbers from 1 to 999; amount stays null while the field holds nothing usable.
export function amountFromInput(text: string) {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3);
  return { digits, amount: digits ? Number(digits) : null };
}
