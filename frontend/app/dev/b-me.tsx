import { useLocalSearchParams } from 'expo-router';

import { MeView } from '@/src/components/b/MeView';

// Development only: renewal B's 내 정보 with samples. ?state=first (nothing known yet)
const nothing = () => undefined;

export default function BMeSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const first = state === 'first';
  return (
    <MeView
      characterId="nabi"
      days={first ? 1 : 12}
      know={[
        { key: 'goal', done: first ? null : '체지방 감량 목표로 맞추고 있어요', missing: '목표를 아직 몰라요', action: first ? '알려 주기' : '고치기', onPress: nothing },
        { key: 'food', done: first ? '가리는 음식 없이 식단을 짜요' : '땅콩 · 갑각류 빼고 식단을 짜요', missing: '', action: '고치기', onPress: nothing },
        { key: 'docs', done: first ? null : '건강 서류 2개를 보고 맞추고 있어요', missing: '인바디 · 검진표가 아직 없어요', action: first ? '올리기' : '보기', onPress: nothing },
      ]}
      name="지원"
      onTier={nothing}
      rows={[
        { key: 'profile', label: '프로필', onPress: nothing },
        { key: 'community', label: '커뮤니티 활동', value: '글 2 · 팔로워 34', onPress: nothing },
        { key: 'notice', label: '알림', value: '모두 꺼짐', onPress: nothing },
        { key: 'font', label: '글자 크기', value: '기본', onPress: nothing },
        { key: 'account', label: '계정', value: 'jiwon@example.com', onPress: nothing },
      ]}
      steps={{ on: true, onToggle: nothing }}
      tier={{ name: 'BALANCE' }}
    />
  );
}
