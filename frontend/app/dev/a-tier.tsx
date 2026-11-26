import { useLocalSearchParams } from 'expo-router';

import { TierView } from '@/src/components/a/TierView';

// Development only: renewal B's tier screen with a sample tier, to look at it without signing in.
// ?at=0..4 (which tier I am in, default 2; 4 is the top, nothing left) | ?state=none (not read)
const nothing = () => undefined;
const names = ['CORE', 'BALANCE', 'ACTIVE', 'FIT', 'PEAK'];

export default function ATierSample() {
  const { at, state } = useLocalSearchParams<{ at?: string; state?: string }>();
  const index = Math.min(4, Math.max(0, Number(at ?? 2) || 0));
  return (
    <TierView
      message={state === 'none' ? '티어를 불러오지 못했어요. 다시 시도하기' : null}
      onBack={nothing}
      onRetry={nothing}
      tier={
        state === 'none'
          ? null
          : { index, name: names[index], stars: 2, ratio: 46, points: 380, left: index === 4 ? null : '120점', from: `${names[index]} 2 · 300점`, to: index === 4 ? null : `${names[index]} 3 · 500점` }
      }
      ways={[
        { title: '식단 관리', detail: '식사 기록 1번마다, 하루 3번까지', points: 2, go: '기록', onPress: nothing },
        { title: '운동 관리', detail: '추천 운동 완료, 하루 1번', points: 5, go: '운동', onPress: nothing },
        { title: '건강 데이터', detail: '검진 · 인바디 올리기, 한 달 1번', points: 15, go: '올리기', onPress: nothing },
      ]}
    />
  );
}
