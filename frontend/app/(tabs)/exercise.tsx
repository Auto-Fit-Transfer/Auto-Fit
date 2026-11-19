import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert } from 'react-native';

import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { getHabitTierProgress } from '@/src/api/tier';
import { ExerciseView, type ExerciseViewProps } from '@/src/components/a/ExerciseView';
import { HealthGoalSheet } from '@/src/components/my/HealthGoalSheet';
import { WHO_KEY, whoList, type Who } from '@/src/components/a/sprites';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';

const tierCodes = ['CORE', 'BALANCE', 'ACTIVE', 'FIT', 'PEAK'] as const;

// Renewal A's exercise tab. The routine, its reason and every number are the server's; the tab only
// lays them out. A plan of several days still opens the schedule screen, as before.
export default function ExerciseScreen() {
  const router = useRouter();
  const {
    homeError, homeLoadState, homeMetrics, latestSession, refreshHome,
    resultRecordCompleted, routine: loadedRoutine, startRoutine, status,
  } = useExerciseRoutine();
  const { beginSession } = useExerciseSession();
  // The context keeps the last recommendation even when it was made on an earlier day.
  const routine = status === 'not-created' ? null : loadedRoutine;
  const [isStarting, setIsStarting] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [who, setWho] = useState<Who>('worker-f');
  const [tierIndex, setTierIndex] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshHome();
    // The face that speaks is my character as it looks at my tier.
    void AsyncStorage.getItem(WHO_KEY).then((saved) => {
      if (active && whoList.includes(saved as Who)) setWho(saved as Who);
    }).catch(() => undefined);
    void getHabitTierProgress().then(({ progress }) => {
      if (active) setTierIndex(Math.max(0, tierCodes.indexOf(progress.tier_code)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [refreshHome]));

  const selectedPlan = routine?.planSessions.find((plan) => plan.id === routine.selectedPlanSessionId);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const futurePlan = Boolean(selectedPlan && selectedPlan.scheduledDate > todayKey);
  const hasPlan = Boolean(routine?.planSessions.length);

  const startNow = async () => {
    if (!routine || isStarting) return;
    setIsStarting(true);
    try {
      const started = await startRoutine();
      beginSession(routine, started);
      router.push('/exercise/session' as Href);
    } catch (error) {
      Alert.alert('운동을 시작하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const doneFacts = [
    latestSession?.durationMinutes ? `${Math.round(latestSession.durationMinutes)}분` : null,
    latestSession?.itemCount ? `${latestSession.itemCount}가지` : null,
    latestSession?.calories ? `${latestSession.calories}kcal` : null,
  ].filter(Boolean).join(' · ');
  const say =
    status === 'completed'
      ? `오늘 운동을 마쳤어요!${doneFacts ? ` ${doneFacts}` : ''}`
      : routine
        ? routine.reasons[0] ?? (routine.subtitle || '오늘의 운동을 준비했어요')
        : '시간과 장소, 컨디션만 고르면 짜 드려요';

  const sets = routine?.exercises.reduce((total, exercise) => total + (exercise.sets ?? 0), 0) ?? 0;
  const minutes = routine?.totalDurationMinutes;
  const plan: ExerciseViewProps['plan'] = routine && status !== 'completed'
    ? {
        title: `${routine.title}${minutes ? ` ${minutes}분` : ''}`,
        meta: [
          `${routine.exercises.length}가지`,
          sets ? `${sets}세트` : null,
          routine.estimatedCalories == null ? null : `약 ${routine.estimatedCalories}kcal`,
        ].filter(Boolean).join(' · '),
        detail: status === 'ready' && !hasPlan ? { label: '자세히', onPress: () => router.push('/exercise/summary') } : undefined,
        moves: routine.exercises.map((exercise) => ({ key: exercise.id, name: exercise.name, detail: exercise.prescription })),
      }
    : null;

  const main: ExerciseViewProps['main'] = homeLoadState === 'loading'
    ? { label: '확인하는 중', onPress: () => undefined, disabled: true }
    : status === 'completed'
      ? { label: '결과 보기', onPress: () => router.push(resultRecordCompleted ? '/exercise/ai-report' : '/exercise/completion') }
      : status === 'ready' && routine
        ? hasPlan
          ? { label: futurePlan ? '운동 일정 보기' : '오늘 운동 보기', onPress: () => router.push('/exercise/summary') }
          : { label: '운동 시작', onPress: () => void startNow(), busy: isStarting }
        : { label: '운동 추천받기', onPress: () => router.push('/exercise/condition') };

  const latestDate = latestSession?.date ? new Date(latestSession.date) : null;
  const latestDetail = latestSession
    ? [
        latestDate && !Number.isNaN(latestDate.getTime()) ? `${latestDate.getMonth() + 1}월 ${latestDate.getDate()}일` : null,
        latestSession.durationMinutes ? `${Math.round(latestSession.durationMinutes)}분` : null,
      ].filter(Boolean).join(' · ')
    : '아직 없어요';

  return (
    <>
      <StatusBar style="dark" />
      <ExerciseView
        error={homeError ? { text: homeError, onRetry: () => void refreshHome() } : null}
        kinds={[
          { label: '오늘의 운동', selected: true, onPress: () => undefined },
          { label: '러닝', onPress: () => router.push('/exercise/running') },
          { label: '자세 분석', onPress: () => router.push('/exercise/posture-check') },
        ]}
        links={[
          ...(routine || status === 'completed' ? [{ label: '다시 추천받기', onPress: () => router.push('/exercise/condition') }] : []),
          { label: '내 루틴 불러오기', onPress: () => router.push('/exercise/saved-routines') },
        ]}
        main={main}
        more={[
          { key: 'history', title: '운동 기록', detail: latestDetail, onPress: () => router.push('/exercise/history') },
          { key: 'goal', title: '운동 목표', detail: homeMetrics.targetWorkoutCount ? `주 ${homeMetrics.targetWorkoutCount}회` : undefined, onPress: () => setGoalOpen(true) },
          { key: 'guide', title: '부위별 운동 가이드', detail: '불편한 부위의 가이드', onPress: () => router.push('/exercise/body-guide') },
        ]}
        onBack={() => router.navigate('/home')}
        plan={plan}
        say={say}
        tierIndex={tierIndex}
        who={who}
      />
      {/* the one goal box of 내 정보: the exercise numbers live in it with the rest of the goal */}
      {goalOpen ? <HealthGoalSheet onClose={() => { setGoalOpen(false); void refreshHome(); }} visible /> : null}
    </>
  );
}
