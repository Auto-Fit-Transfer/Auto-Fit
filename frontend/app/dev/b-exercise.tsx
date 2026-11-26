import type { ComponentProps } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ExerciseView, type ExerciseViewProps } from '@/src/components/b/ExerciseView';
import { BottomNavigation } from '@/src/components/navigation';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): renewal B's
// exercise tab with sample data, to look at the screen. ?state=none|done|plan|error
const tabs = ['home', 'diet', 'exercise', 'community', 'my'];
const tabBar = {
  state: { index: 2, routes: tabs.map((name) => ({ key: name, name })) },
  descriptors: Object.fromEntries(tabs.map((name) => [name, { options: {} }])),
  emitter: { emit: () => ({ defaultPrevented: false }) },
  navigateToTab: () => undefined,
} as unknown as ComponentProps<typeof BottomNavigation>;
const nothing = () => undefined;
// A grey stand-in where a move's demo goes (the purchased demos are not put in sample pages).
const DEMO = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#FFFFFF"/><circle cx="100" cy="70" r="26" fill="#D9DCE6"/><rect x="62" y="108" width="76" height="62" rx="22" fill="#D9DCE6"/></svg>')}`;
const links = [
  { label: '다시 추천받기', onPress: nothing },
  { label: '내 루틴 불러오기', onPress: nothing },
];

export default function BExerciseSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const view: Pick<ExerciseViewProps, 'headline' | 'line' | 'card'> =
    state === 'none'
      ? {
          headline: [[{ text: '오늘 운동을' }], [{ text: '정해 볼까요' }]],
          line: '시간과 장소, 컨디션만 고르면 짜 드려요',
          card: { moves: [], main: { label: '오늘 운동 추천받기', onPress: nothing }, links: links.slice(1) },
        }
      : state === 'done'
        ? {
            headline: [[{ text: '오늘 운동을' }], [{ text: '마쳤어요' }]],
            line: '8분 · 3가지 · 30kcal',
            card: { moves: [], main: { label: '결과 보기', onPress: nothing }, links },
          }
        : {
            headline: [[{ text: '오늘은' }], [{ text: '코어 루틴 ' }, { text: '8분', mark: true }]],
            line: '어제 하체를 해서 오늘은 코어로 짰어요',
            card: {
              facts: '3가지 · 9세트 · 약 30kcal',
              detail: state === 'plan' ? undefined : { label: '자세히', onPress: nothing },
              moves: [
                { key: 'a', name: '크런치', detail: '3세트 · 20회', picture: DEMO },
                { key: 'b', name: '러시안 트위스트', detail: '3세트 · 24회', picture: DEMO },
                { key: 'c', name: '플랭크', detail: '3세트 · 60초', picture: DEMO },
              ],
              main: { label: state === 'plan' ? '오늘 운동 보기' : '운동 시작하기', onPress: nothing },
              links,
            },
          };

  return (
    <View style={{ flex: 1 }}>
      <ExerciseView
        {...view}
        by={{ characterId: 'quni', text: state === 'none' || state === 'done' ? '쿼니' : '쿼니가 짜 뒀어요' }}
        error={state === 'error' ? { text: '운동 정보를 불러오지 못했어요', onRetry: nothing } : null}
        kind={{ label: '오늘의 운동', onPress: nothing }}
        more={[
          { key: 'history', title: '운동 기록', detail: '11월 11일 · 20분', onPress: nothing },
          { key: 'goal', title: '운동 목표', detail: '주 3회', onPress: nothing },
          { key: 'guide', title: '부위별 운동 가이드', detail: '불편한 부위의 가이드', onPress: nothing },
        ]}
      />
      <BottomNavigation {...tabBar} />
    </View>
  );
}
