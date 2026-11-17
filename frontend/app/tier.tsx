import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { TierView } from '@/src/components/a/TierView';
import { useKeptWho } from '@/src/components/a/useKeptWho';
import { nextTierName } from '@/src/features/tier/tierBadges';
import { tierLook } from '@/src/features/tier/tierLook';

// Renewal A's tier screen. Points and limits come from the habit tier policy in the database.
export default function TierScreen() {
  const router = useRouter();
  const who = useKeptWho();
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getHabitTierProgress().then(({ progress }) => {
      if (active) { setTier(progress); setFailed(false); }
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
    // A retry replaces the focus callback and cancels its previous request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));
  const look = tier ? tierLook(tier) : null;
  const nextName = tier ? nextTierName(tier) : null;

  return (
    <TierView
      message={tier ? null : failed ? '티어를 불러오지 못했어요. 다시 시도하기' : '티어를 불러오는 중…'}
      onBack={() => router.back()}
      onRetry={failed ? () => { setFailed(false); setAttempt((value) => value + 1); } : undefined}
      tier={
        tier && look
          ? {
              index: look.index,
              name: tier.tier_name,
              stars: tier.sublevel,
              ratio: look.ratio,
              points: tier.points,
              left: tier.next_level_points === null ? '가장 높은 단계예요' : `${nextName}까지 ${look.left}`,
              from: `${tier.tier_name} ${tier.sublevel} · ${tier.level_start_points.toLocaleString('ko-KR')}점`,
              to: nextName && tier.next_level_points !== null ? `${nextName} · ${tier.next_level_points.toLocaleString('ko-KR')}점` : null,
            }
          : null
      }
      ways={[
        { title: '식단 관리', detail: '식사 기록 1번마다, 하루 3번까지', points: 2, icon: 0, onPress: () => router.push('/diet') },
        { title: '운동 관리', detail: '추천 운동 완료, 하루 1번', points: 5, icon: 1, onPress: () => router.push('/exercise') },
        { title: '건강 데이터', detail: '검진 · 인바디 올리기, 한 달 1번', points: 15, icon: 3, onPress: () => router.push('/health-data-management') },
      ]}
      who={who}
    />
  );
}
