import { useLocalSearchParams } from 'expo-router';

import { ExerciseView } from '@/src/components/a/ExerciseView';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): renewal A's
// exercise tab with sample data, to look at the screen. ?state=none|done
const nothing = () => undefined;

export default function AExerciseSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const none = state === 'none';
  const done = state === 'done';
  return (
    <ExerciseView
      kinds={[
        { label: '오늘의 운동', selected: true, onPress: nothing },
        { label: '러닝', onPress: nothing },
        { label: '자세 분석', onPress: nothing },
      ]}
      links={[
        ...(none ? [] : [{ label: '다시 추천받기', onPress: nothing }]),
        { label: '내 루틴 불러오기', onPress: nothing },
      ]}
      main={{ label: done ? '결과 보기' : none ? '운동 추천받기' : '운동 시작', onPress: nothing }}
      more={[
        { key: 'history', title: '운동 기록', detail: '11월 11일 · 20분', onPress: nothing },
        { key: 'goal', title: '운동 목표', detail: '주 3회', onPress: nothing },
        { key: 'progress', title: '진행 현황', detail: '주간 · 월간 변화', onPress: nothing },
        { key: 'guide', title: '부위별 운동 가이드', detail: '불편한 부위의 가이드', onPress: nothing },
      ]}
      onBack={nothing}
      plan={
        none || done
          ? null
          : {
              title: '코어 루틴 8분',
              meta: '3가지 · 9세트 · 약 30kcal',
              detail: { label: '자세히', onPress: nothing },
              moves: [
                { key: 'a', name: '크런치', detail: '3세트 · 20회' },
                { key: 'b', name: '러시안 트위스트', detail: '3세트 · 24회' },
                { key: 'c', name: '플랭크', detail: '3세트 · 60초' },
              ],
            }
      }
      say={done ? '오늘 운동을 마쳤어요! 8분 · 3가지 · 30kcal' : none ? '시간과 장소, 컨디션만 고르면 짜 드려요' : '어제 하체를 해서 오늘은 코어로 짰어요'}
      tierIndex={1}
      who="worker-f"
    />
  );
}
