import type { ComponentProps } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { HomeView, type HomeViewProps } from '@/src/components/b/HomeView';
import { BottomNavigation } from '@/src/components/navigation';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): renewal B's home
// with sample data, to look at the screen. ?who=nabi|coach  ?state=first|done|loading|error
const tabs = ['home', 'diet', 'exercise', 'community', 'my'];
const tabBar = {
  state: { index: 0, routes: tabs.map((name) => ({ key: name, name })) },
  descriptors: Object.fromEntries(tabs.map((name) => [name, { options: {} }])),
  emitter: { emit: () => ({ defaultPrevented: false }) },
  navigateToTab: () => undefined,
} as unknown as ComponentProps<typeof BottomNavigation>;
const nothing = () => undefined;

export default function BHomeSample() {
  const { who, state } = useLocalSearchParams<{ who?: string; state?: string }>();
  const characterId: ChatCharacterId = who === 'nabi' || who === 'coach' ? who : 'quni';
  const done = state === 'done';
  const first = state === 'first';
  const days = ['월', '화', '수', '목', '금', '토', '일'].map((label, index) => ({
    key: label,
    label,
    done: first ? false : index === 0 || index === 2 || (done && index === 3),
    today: index === 3,
  }));
  const did: HomeViewProps['did'] = first
    ? [{ key: 'diet', title: '오늘 식단을 골라 뒀어요', detail: '하루 목표 1,700kcal에 맞췄어요', action: { label: '식단 보기', onPress: nothing } }]
    : [
        { key: 'eaten', title: '오늘 먹은 것을 더해 뒀어요', detail: '480kcal · 목표 1,700kcal' },
        { key: 'diet', title: '오늘 식단을 골라 뒀어요', detail: '하루 목표 1,700kcal에 맞췄어요', action: { label: '식단 보기', onPress: nothing } },
        ...(done ? [] : [{ key: 'routine', title: '오늘 운동을 짜 뒀어요', detail: '어제 하체를 해서 오늘은 코어로 짰어요' }]),
      ];

  return (
    <View style={{ flex: 1 }}>
      <HomeView
        characterId={characterId}
        did={did}
        firstDay={first}
        name="지원"
        now={
          done
            ? { label: '오늘 할 일 끝', title: '오늘 운동 8분', facts: '약 30kcal', button: '기록 보기', onPress: nothing }
            : first
              ? { label: '지금 할 일 하나', title: '오늘 운동 정하기', facts: '시간과 장소만 고르면 짜 드려요', button: '시작', onPress: nothing }
              : { label: '지금 할 일 하나', title: '코어 루틴 8분', facts: '약 30kcal · 3가지', button: '시작', onPress: nothing }
        }
        onAsk={nothing}
        onRetry={nothing}
        state={state === 'loading' || state === 'error' ? state : 'ready'}
        tier={{
          name: first ? 'CORE 1' : 'BALANCE 2',
          ratio: first ? 0 : done ? 65 : 50,
          next: first ? 'CORE 2까지 100점' : done ? 'BALANCE 3까지 70점' : 'BALANCE 3까지 100점',
          onPress: nothing,
        }}
        week={{
          days,
          summary: first ? '이번 주 첫 운동을 해 봐요' : done ? '3일 운동 · 오늘도 했어요' : '2일 운동 · 오늘은 아직',
          onPress: nothing,
        }}
      />
      <BottomNavigation {...tabBar} />
    </View>
  );
}
