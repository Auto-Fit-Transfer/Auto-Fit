import type { ComponentProps } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { R6ExerciseSession } from '@/src/components/exercise/R6ExerciseSession';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): the workout-in-progress
// screen with sample data, to look at its A look. ?state=rest
// shortcut: only the values the screen shows are filled in, so this page is cast to the screen's props.
type Props = ComponentProps<typeof R6ExerciseSession>;
const nothing = () => undefined;
const move = (id: string, name: string, prescription: string) => ({
  id, sessionItemId: id, name, prescription, mode: 'reps', totalSets: 3, targetRepetitions: 20, targetSeconds: null,
  sets: 3, repetitions: 20, restSeconds: 10, instruction: '턱을 당기고 배 힘으로 올라와요', demoGifUrl: null, demoVideoUrl: null, thumbnailUrl: null,
});

export default function ASessionSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const exercises = [move('a', '크런치', '3세트 · 20회'), move('b', '러시안 트위스트', '3세트 · 24회'), move('c', '플랭크', '3세트 · 60초')];
  const session = {
    adjustmentPending: false, countSpeed: 1, currentExerciseIndex: 0, currentRep: 5, currentSet: 1, elapsedExerciseMs: 9000,
    exercises, exitConfirmationVisible: false, guideEnabled: false, lastTickAt: null, paused: false,
    phase: state === 'rest' ? 'rest' : 'exercise', repAccumulatorMs: 0, restRemainingMs: 9000, results: [], startedAt: 0, totalElapsedMs: 9000,
  };
  return (
    <R6ExerciseSession
      exercise={exercises[0] as unknown as Props['exercise']}
      onAddRest={nothing}
      onBack={nothing}
      onCompleteSet={nothing}
      onReportDiscomfort={async () => 0}
      onReportStop={nothing}
      onSkip={nothing}
      onSkipRest={nothing}
      onStopWorkout={nothing}
      onTogglePause={nothing}
      session={session as unknown as Props['session']}
    />
  );
}
