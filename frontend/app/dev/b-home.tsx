import type { ComponentProps } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { HomeBoldView, type HomeProposal } from '@/src/components/b/HomeBoldView';
import { BottomNavigation } from '@/src/components/navigation';
import { homeHeadline } from '@/src/features/b/homePlan';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): renewal B's home
// with sample data, to look at the screen. ?who=nabi|coach  ?state=done|first|nomeal|loading|error
const tabs = ['home', 'diet', 'exercise', 'community', 'my'];
const tabBar = {
  state: { index: 0, routes: tabs.map((name) => ({ key: name, name })) },
  descriptors: Object.fromEntries(tabs.map((name) => [name, { options: {} }])),
  emitter: { emit: () => ({ defaultPrevented: false }) },
  navigateToTab: () => undefined,
} as unknown as ComponentProps<typeof BottomNavigation>;
const nothing = () => undefined;
// A grey stand-in where the first move's demo goes (the purchased demos are not put in sample pages).

export default function BHomeSample() {
  const { who, state } = useLocalSearchParams<{ who?: string; state?: string }>();
  const characterId: ChatCharacterId = who === 'nabi' || who === 'coach' ? who : 'quni';
  const done = state === 'done';
  const first = state === 'first';
  const loadState = state === 'loading' || state === 'error' ? state : 'ready';
  const meal = state === 'nomeal' ? null : done ? { id: 'dinner', title: '저녁', kcal: 520 } : { id: 'lunch', title: '점심', kcal: 560 };
  const days = ['월', '화', '수', '목', '금', '토', '일'].map((label, index) => ({
    key: label,
    label,
    done: first ? false : index === 0 || index === 2 || (done && index === 3),
    today: index === 3,
  }));
  const proposals: HomeProposal[] = [
    ...(done || first ? [] : [{
      key: 'routine', title: '어제 하체를 해서 오늘은 코어로 짰어요', detail: '크런치 · 러시안 트위스트 · 플랭크 · 8분',
      choices: [{ label: '이대로', kind: 'accept', onPress: nothing }, { label: '가볍게 조정', kind: 'adjust', onPress: nothing }, { label: '내 루틴으로', kind: 'own', onPress: nothing }],
    } satisfies HomeProposal]),
    ...(meal ? [{
      key: `meal-${meal.id}`, title: `${meal.title} 메뉴를 골라 뒀어요`, detail: done ? '두부 스테이크 · 나물 · 잡곡밥 · 520kcal' : '닭가슴살 구이 · 현미밥 · 된장국 · 560kcal',
      choices: [{ label: '이대로', kind: 'accept', onPress: nothing }, { label: '다른 메뉴', kind: 'adjust', onPress: nothing }, { label: '먹은 걸로 기록', kind: 'own', onPress: nothing }],
    } satisfies HomeProposal] : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <HomeBoldView
        by="쿼니 · 오전 9:12에 살펴봤어요"
        characterId={characterId}
        name="지원"
        now={
          done
            ? { label: '오늘 할 일 끝', title: '오늘 운동 8분', facts: '약 30kcal', button: '기록 보기', onPress: nothing }
            : first
              ? { label: '지금 할 일 하나', title: '오늘 운동 정하기', facts: '시간과 장소만 고르면 짜 드려요', button: '시작', onPress: nothing }
              : null
        }
        onAsk={nothing}
        onRetry={nothing}
        plan={
          loadState === 'loading'
            ? [[{ text: '지원 님,' }], [{ text: '오늘을 살펴보고 있어요' }]]
            : loadState === 'error'
              ? [[{ text: '오늘 정보를' }], [{ text: '불러오지 못했어요' }]]
              : first
                ? [[{ text: '반가워요, 지원 님' }], [{ text: '오늘을 같이 시작해요' }]]
                : homeHeadline('지원', '코어 루틴 8분', done, meal)
        }
        proposals={loadState === 'ready' ? proposals : []}
        recorded={loadState === 'ready' && !first ? { text: '오늘 480kcal를 기록해 뒀어요', action: { label: '고치기', onPress: nothing } } : null}
        state={loadState}
        tier={{ name: first ? 'CORE 1' : 'BALANCE 2', ratio: first ? 0 : done ? 65 : 50, next: first ? 'CORE 2까지 100점' : done ? 'BALANCE 3까지 70점' : 'BALANCE 3까지 100점', onPress: nothing }}
        week={{ days, summary: first ? '이번 주 첫 운동을 해 봐요' : done ? '3일 운동 · 오늘도 했어요' : '2일 운동 · 오늘은 아직', onPress: nothing }}
      />
      <BottomNavigation {...tabBar} />
    </View>
  );
}
