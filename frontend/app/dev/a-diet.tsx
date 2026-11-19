import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DietView } from '@/src/components/a/DietView';
import type { R6Meal } from '@/src/components/diet/R6DietHome';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): renewal A's
// diet tab with sample data, to look at the screen. ?state=first|after|loading|error
const nothing = () => undefined;
const meal = (
  id: R6Meal['id'],
  title: string,
  foods: string,
  kcal: number,
  status: R6Meal['status'],
  note = '',
  detail: string | null = null,
): R6Meal => ({
  id, title, foods, kcal, status, note, detail,
  canSave: true, pending: false, regenerating: false,
  allergyWarning: null, allergyBlocked: false, canRegenerateDay: false,
});

export default function ADietSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const first = state === 'first';
  const after = state === 'after';
  const meals: R6Meal[] = state === 'loading' || state === 'error' ? [] : [
    first
      ? meal('breakfast', '아침', '그릭요거트 볼', 320, 'recommended', '체지방 감량 목표에 맞춰 아침은 가볍게 골랐어요')
      : meal('breakfast', '아침', '현미밥 · 연어구이 · 두부샐러드', 480, 'eaten', '', '08:12 사진으로 기록 · 탄 62g 단 31g 지 14g'),
    after
      ? meal('lunch', '점심', '김치볶음밥 · 닭가슴살 샐러드 · 미역국', 760, 'modified', '', '12:40 사진으로 기록')
      : meal('lunch', '점심', '닭가슴살 구이 · 현미밥 · 된장국', 560, 'recommended', '단백질 목표 100g 중 31g만 채워서 점심은 닭가슴살로 골랐어요'),
    meal('snack', '간식', '바나나 · 아메리카노', 120, 'recommended', '저녁까지 허기지지 않게 가볍게 넣었어요'),
    meal('dinner', '저녁', '두부버섯 볶음 · 현미밥 · 나물', 520, 'recommended', '하루 목표 1,700kcal 안에 들어오게 520kcal로 맞췄어요'),
  ];
  // ?state=over: today went past the goal, so 내일 맞추기 shows
  const over = state === 'over';
  const eaten = over ? 2160 : first ? 0 : after ? 1240 : 480;

  return (
    <View style={{ flex: 1 }}>
      <DietView
        dayRegenerating={false}
        goals={[
          { label: '칼로리', current: eaten, target: 1700, unit: 'kcal' },
          { label: '탄수화물', current: first ? 0 : after ? 146 : 62, target: 210, unit: 'g' },
          { label: '단백질', current: first ? 0 : after ? 80 : 31, target: 100, unit: 'g' },
          { label: '지방', current: first ? 0 : after ? 36 : 14, target: 55, unit: 'g' },
        ]}
        hasUnknownItems={false}
        meals={meals}
        mealsError={state === 'error' ? '식단을 불러오지 못했어요.' : null}
        mealsLoading={state === 'loading'}
        nutritionError={null}
        onAlternative={nothing}
        onOpenProteinGuide={nothing}
        onOpenRecipe={nothing}
        onOpenWeekly={nothing}
        onRecord={nothing}
        onRegenerateDay={nothing}
        onRetryMeals={nothing}
        onRetryNutrition={nothing}
        onSelectDateOffset={nothing}
        onStatusChange={nothing}
        selectedDateKey="2026-11-12"
        selectedDateOffset={0}
        showRecordControls
        today={new Date(2026, 10, 12)}
        // Monday 9 to Sunday 15 November; Thursday the 12th is today
        onAdjust={over ? () => undefined : undefined}
        week={first ? null : [1620, 1480, 1810, after ? 1240 : 480, null, null, null].map((kcal, index) => ({ date: `2026-11-${String(9 + index).padStart(2, '0')}`, kcal, target: 1700 }))}
      />
    </View>
  );
}
