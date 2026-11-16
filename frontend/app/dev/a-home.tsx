import { useLocalSearchParams } from 'expo-router';

import { LobbyView } from '@/src/components/a/LobbyView';
import { whoList, type Who } from '@/src/components/a/sprites';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): renewal A's home
// with sample data, to look at the screen. ?who=worker-m|student-f|student-m  ?tier=0…4  ?state=done
const nothing = () => undefined;
const tiers = ['CORE', 'BALANCE', 'ACTIVE', 'FIT', 'PEAK'];

export default function AHomeSample() {
  const params = useLocalSearchParams<{ who?: string; tier?: string; state?: string }>();
  const who = whoList.includes(params.who as Who) ? (params.who as Who) : 'worker-f';
  const index = Math.min(4, Math.max(0, Number(params.tier ?? 1) || 0));
  const done = params.state === 'done';
  return (
    <LobbyView
      name="지원"
      onAsk={nothing}
      onMe={nothing}
      onPickWho={nothing}
      onMenu={nothing}
      onTier={nothing}
      steps={{ count: 4820 }}
      quests={[
        { key: 'meal', icon: 0, name: '식사 기록하기', done: true, action: { label: '기록', onPress: nothing } },
        { key: 'water', icon: 5, name: '물 6잔', done: false, state: '3 / 6잔', say: '물 한 잔 마실 시간이에요', action: { label: '한 잔', onPress: nothing } },
        { key: 'stretch', icon: 6, name: '스트레칭 5분', done: false, state: '몸을 풀고 나서 눌러 주세요', action: { label: '했어요', onPress: nothing } },
        { key: 'workout', icon: 1, points: 5, name: '오늘의 운동', done, state: '코어 루틴 8분', say: '오늘의 운동, 지금 해 볼까요?', action: { label: '시작', onPress: nothing } },
      ]}
      tier={{ index, name: tiers[index], stars: 2, ratio: 53, left: '60점', next: index < 4 ? `${tiers[index + 1]}까지` : '가장 높은 티어' }}
      who={who}
    />
  );
}
