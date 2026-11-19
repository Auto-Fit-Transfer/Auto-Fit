import { useLocalSearchParams } from 'expo-router';

import { TomorrowSheet, type TomorrowMeal, type TomorrowPlan } from '@/src/components/a/TomorrowSheet';

// Development only: renewal A's 내일 맞추기 sheet with a sample proposal (no server call exists yet).
// ?state=choose (cheat day or adjust, first) | pick (the meals to make lighter) | loading | ready (default) | saving | saved | error
const nothing = () => undefined;
const TOMORROW: TomorrowMeal[] = [
  { kcal: 420, menu: '그릭요거트 볼 · 삶은 달걀', slot: '아침' },
  { kcal: 560, menu: '현미밥 · 닭가슴살 샐러드 · 된장국', slot: '점심' },
  { kcal: 180, menu: '바나나 · 라떼', slot: '간식' },
  { kcal: 540, menu: '두부 스테이크 · 나물 · 잡곡밥', slot: '저녁' },
];
// lunch and dinner were picked: 100 each asked, 15% lets 84 and 81 go, 35 stays
const PLAN: TomorrowPlan = {
  cut: 165,
  left: 35,
  kcal: 1535,
  meals: [
    { changed: false, kcal: 420, menu: '그릭요거트 볼 · 삶은 달걀', slot: '아침' },
    { changed: true, kcal: 476, menu: '현미밥 · 닭가슴살 샐러드 · 된장국(국물 반만)', slot: '점심' },
    { changed: false, kcal: 180, menu: '바나나 · 라떼', slot: '간식' },
    { changed: true, kcal: 459, menu: '두부 스테이크 · 나물 · 잡곡밥 반 공기', slot: '저녁' },
  ],
  target: 1700,
  why: '단백질은 그대로 두고, 점심 국물과 저녁 밥 양을 줄였어요.',
};

export default function ATomorrowSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const shown = state === 'choose' || state === 'pick' || state === 'loading' || state === 'saving' || state === 'saved' || state === 'error' ? state : 'ready';
  return (
    <TomorrowSheet
      error={shown === 'error' ? '고른 끼니를 다시 짜지 못했어요. 잠시 후 다시 시도해 주세요.' : ''}
      onClose={nothing}
      onRetry={nothing}
      onSave={nothing}
      onCheat={nothing}
      onAdjust={nothing}
      onPick={nothing}
      // 2,200 eaten, 300 burned in the workout, a 1,700 goal: 200 over
      eaten={2200}
      burned={300}
      target={1700}
      over={200}
      tomorrow={TOMORROW}
      plan={shown === 'choose' || shown === 'pick' || shown === 'loading' || shown === 'error' ? null : PLAN}
      state={shown}
      visible
    />
  );
}
