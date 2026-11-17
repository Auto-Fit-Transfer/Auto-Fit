import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { MeView } from '@/src/components/a/MeView';

// Development only: renewal A's 내 정보 with sample values (the design's own: a-me.html), to look at it
// without signing in. ?state=none (nothing set yet) | off (step counting switched off) | long (long values)
const nothing = () => undefined;

export default function AMeSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [counting, setCounting] = useState(state !== 'off');
  const none = state === 'none';
  const long = state === 'long';
  return (
    <MeView
      days={42}
      health={[
        { key: 'docs', label: '건강 서류', value: '검진표 · 인바디', onPress: nothing },
        { key: 'goal', label: '건강 목표', value: none ? '아직 정하지 않았어요' : long ? '내년 봄 결혼식 준비를 위한 체지방 감량과 체력 기르기' : '체지방 감량', onPress: nothing },
        { key: 'allergy', label: '알레르기', value: none ? '없어요' : long ? '땅콩 외 4가지' : '땅콩 · 갑각류', onPress: nothing },
      ]}
      name={long ? '아침마다달리는지원이' : '지원'}
      onBack={nothing}
      onEdit={nothing}
      onTier={nothing}
      settings={[
        { key: 'community', label: '커뮤니티 활동', value: '글 2 · 팔로워 34', onPress: nothing },
        { key: 'notice', label: '알림', value: none ? '모두 꺼짐' : '4가지 켜짐', onPress: nothing },
        { key: 'font', label: '글자 크기', value: '기본', onPress: nothing },
        { key: 'account', label: '계정', value: long ? 'jiwon.kim.running.every.morning@example.com' : 'jiwon@example.com', onPress: nothing },
      ]}
      steps={{ on: counting, onToggle: () => setCounting((now) => !now) }}
      tier={{ name: 'BALANCE', stars: 2 }}
      tierIndex={1}
      who="worker-f"
    />
  );
}
