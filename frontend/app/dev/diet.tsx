import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppButton, SegmentedControl } from '@/src/components/common';
import { MealRecordSheets, type MealRecordDraft } from '@/src/components/diet/MealRecordSheets';
import { useAppTheme } from '@/src/theme';

// A plain gray picture stands in for the meal photo here.
const samplePhoto =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#DFE2E7"/><circle cx="200" cy="100" r="70" fill="#F2F4F6"/></svg>',
  );

// The foods the photo step "finds", as in the Figma D2 sample.
const reviewDraft: MealRecordDraft = {
  mealId: 'lunch',
  mealTime: '12:00',
  photoUri: samplePhoto,
  foods: [
    {
      id: 'rice',
      databaseId: 'db-kimchi-rice',
      name: '김치볶음밥',
      serving: 1,
      amount: 300,
      baseAmount: 300,
      unit: 'g',
      kcal: 480,
      carbs: 72,
      protein: 14,
      fat: 13,
    },
    {
      id: 'salad',
      databaseId: 'db-chicken-salad',
      name: '닭가슴살 샐러드',
      serving: 1,
      amount: 200,
      baseAmount: 200,
      unit: 'g',
      kcal: 210,
      carbs: 18,
      protein: 30,
      fat: 5,
    },
    {
      id: 'soup',
      databaseId: 'db-seaweed-soup',
      name: '미역국',
      serving: 1,
      amount: 200,
      baseAmount: 200,
      unit: 'g',
      kcal: 80,
      carbs: 9,
      protein: 4,
      fat: 3,
    },
  ],
  kcal: 0,
  tags: [],
  note: '',
  usedIngredients: [],
  intake: [],
};

const options = [
  { value: 'review', label: '찾은 음식' },
  { value: 'photo', label: '사진 고르기' },
] as const;

// Development-only page for the meal record flow (Figma D2 · D3) with sample foods.
// Open /dev/diet on the web preview; saving only closes the flow.
export default function DevDiet() {
  const { colors } = useAppTheme();
  const [start, setStart] = useState<(typeof options)[number]['value']>('review');
  const [visible, setVisible] = useState(true);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ backgroundColor: colors.background, flex: 1, gap: 12, padding: 16 }}>
      <SegmentedControl
        onChange={(value) => {
          setStart(value);
          setVisible(true);
        }}
        options={options}
        value={start}
      />
      <AppButton onPress={() => setVisible(true)} title="기록 화면 열기" />
      <MealRecordSheets
        initialDraft={start === 'review' ? reviewDraft : undefined}
        mealId={visible ? 'lunch' : null}
        onClose={() => setVisible(false)}
        onComplete={async () => {
          setVisible(false);
          return true;
        }}
        visible={visible}
      />
    </View>
  );
}
