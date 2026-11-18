import { useLocalSearchParams } from 'expo-router';

import { MealRecordSheets, type MealRecordDraft } from '@/src/components/diet/MealRecordSheets';

// Development only: renewal A's meal record sheets, to look at them without signing in. Nothing is sent.
// (default) the photo step | ?state=review (two foods already found)
const nothing = () => undefined;
const FOUND: MealRecordDraft = {
  foods: [
    { amount: 210, carbs: 65, fat: 1, id: 'a', kcal: 300, name: '현미밥', protein: 6, serving: 1, unit: 'g' },
    { amount: 150, carbs: 6, fat: 12, id: 'b', kcal: 230, name: '고등어구이', protein: 22, serving: 1, unit: 'g' },
  ],
  intake: [],
  kcal: 530,
  mealId: 'lunch',
  mealTime: '12:30',
  note: '',
  photoUri: null,
  tags: [],
  usedIngredients: [],
};

export default function AMealSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  return <MealRecordSheets initialDraft={state === 'review' ? FOUND : undefined} mealId="lunch" onClose={nothing} onComplete={async () => false} visible />;
}
