import { useLocalSearchParams } from 'expo-router';

import { TierView } from '@/src/components/a/TierView';
import type { Who } from '@/src/components/a/sprites';

// Development only: renewal A's tier screen with a sample tier, to look at it without signing in.
// ?at=0..4 (which tier I am in, default 2) &who=worker-m | student-f | student-m | ?state=none (not read)
const nothing = () => undefined;
const names = ['CORE', 'BALANCE', 'ACTIVE', 'FIT', 'PEAK'];

export default function ATierSample() {
  const { at, who, state } = useLocalSearchParams<{ at?: string; who?: string; state?: string }>();
  const index = Math.min(4, Math.max(0, Number(at ?? 2) || 0));
  return (
    <TierView
      message={state === 'none' ? '티어를 불러오지 못했어요. 다시 시도하기' : null}
      onBack={nothing}
      onRetry={nothing}
      tier={
        state === 'none'
          ? null
          : { index, name: names[index], stars: 2, ratio: 46, points: 380, left: `${names[index]} 3까지 120점`, from: `${names[index]} 2 · 300점`, to: `${names[index]} 3 · 500점` }
      }
      ways={[
        { title: '식단 관리', detail: '식사 기록 1번마다, 하루 3번까지', points: 2, icon: 0, onPress: nothing },
        { title: '운동 관리', detail: '추천 운동 완료, 하루 1번', points: 5, icon: 1, onPress: nothing },
        { title: '건강 데이터', detail: '검진 · 인바디 올리기, 한 달 1번', points: 15, icon: 3, onPress: nothing },
      ]}
      who={(who as Who) ?? 'worker-f'}
    />
  );
}
