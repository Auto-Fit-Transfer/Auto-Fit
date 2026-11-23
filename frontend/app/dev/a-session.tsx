import type { ComponentProps } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { R6ExerciseSession } from '@/src/components/exercise/R6ExerciseSession';

// Development only (isPublicRoute lets /dev open without signing in while __DEV__): the workout-in-progress
// screen with sample data, to look at its A look. ?state=rest | last (a rest's last seconds) | hold (a timed move)
// | demo (with a picture where the demo goes) | second (the second move, one finished and counted)
// shortcut: only the values the screen shows are filled in, so this page is cast to the screen's props.
type Props = ComponentProps<typeof R6ExerciseSession>;
const nothing = () => undefined;
// A grey 16:9 picture that stands in for a demo (the web shows it; that is where this page is looked at).
const DEMO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#E4E7F0"/><circle cx="400" cy="170" r="60" fill="#B9BED0"/><rect x="290" y="250" width="220" height="130" rx="40" fill="#B9BED0"/></svg>')}`;
const move = (id: string, name: string, prescription: string) => ({
  id, sessionItemId: id, name, prescription, mode: 'reps', totalSets: 3, targetRepetitions: 20, targetSeconds: null,
  sets: 3, repetitions: 20, restSeconds: 10, instruction: '턱을 당기고 배 힘으로 올라와요', demoGifUrl: null, demoVideoUrl: null, thumbnailUrl: null,
});

export default function ASessionSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const exercises = [move('a', '크런치', '3세트 · 20회'), move('b', '러시안 트위스트', '3세트 · 24회'), { ...move('c', '플랭크', '3세트 · 60초'), mode: 'timed', targetRepetitions: null, targetSeconds: 60 }];
  const at = state === 'hold' ? 2 : state === 'second' ? 1 : 0;
  if (state === 'demo') Object.assign(exercises[0], { thumbnailUrl: DEMO });
  const session = {
    adjustmentPending: false, countSpeed: 'normal', currentExerciseIndex: at, currentRep: 5, currentSet: state === 'minute' ? 3 : 1, elapsedExerciseMs: state === 'minute' ? 18000 : 134000,
    exercises, exitConfirmationVisible: false, guideEnabled: false, lastTickAt: null, paused: false,
    phase: state === 'rest' || state === 'last' ? 'rest' : 'exercise', repAccumulatorMs: 0, restRemainingMs: state === 'last' ? 2400 : 7000, restTotalMs: 10000, setRemainingMs: 42000,
    results: at ? [{ caloriesBurned: 23, sessionItemId: 'a', skipped: false }] : [], startedAt: 0, totalElapsedMs: 134000,
    savedRoutine: state === 'minute' ? '아침 코어' : null, // ?state=minute: a saved routine's last set before 1 minute
  };
  return (
    <R6ExerciseSession
      exercise={exercises[at] as unknown as Props['exercise']}
      onAddRest={nothing}
      onBack={nothing}
      onCompleteSet={nothing}
      onCycleSpeed={nothing}
      onReportDiscomfort={async () => 0}
      onReportStop={async () => state !== 'stopfail'} // ?state=stopfail: the server did not take the stop
      onRetryStop={async () => true}
      onSkip={nothing}
      onSkipRest={nothing}
      onStopWorkout={nothing}
      onTogglePause={nothing}
      session={session as unknown as Props['session']}
      tierIndex={1}
      who="worker-f"
    />
  );
}
