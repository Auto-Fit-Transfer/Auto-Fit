import { useLocalSearchParams } from 'expo-router';

import { TomorrowSheet, type TomorrowPlan } from '@/src/components/a/TomorrowSheet';

// Development only: renewal A's 내일 맞추기 sheet with a sample proposal (no server call exists yet).
// ?state=loading | ready (default) | saving | saved | error
const nothing = () => undefined;
const PLAN: TomorrowPlan = {
  kcal: 1480,
  meals: [
    { changed: false, kcal: 420, menu: '그릭요거트 볼 · 삶은 달걀', slot: '아침' },
    { changed: true, kcal: 480, menu: '현미밥 · 닭가슴살 샐러드 · 된장국(국물 반만)', slot: '점심' },
    { changed: true, kcal: 120, menu: '방울토마토 · 아몬드 한 줌', slot: '간식' },
    { changed: true, kcal: 460, menu: '두부 스테이크 · 나물 · 잡곡밥 반 공기', slot: '저녁' },
  ],
  target: 1700,
  why: '단백질은 그대로 두고, 점심 국물과 저녁 밥 양을 줄였어요.',
};

export default function ATomorrowSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const shown = state === 'loading' || state === 'saving' || state === 'saved' || state === 'error' ? state : 'ready';
  return (
    <TomorrowSheet
      error={shown === 'error' ? '내일 식단을 짜지 못했어요. 잠시 후 다시 시도해 주세요.' : ''}
      onClose={nothing}
      onRetry={nothing}
      onSave={nothing}
      over={460}
      plan={shown === 'loading' || shown === 'error' ? null : PLAN}
      state={shown}
      visible
    />
  );
}
