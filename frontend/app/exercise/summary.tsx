import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Alert, BackHandler, Platform } from 'react-native';

import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { getPostureCapabilities, type PostureCapability } from '@/src/api/posture';
import { RoutinePlanView } from '@/src/components/a/RoutinePlanView';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { exerciseEquipmentLabels, exerciseIntensityLabels, exerciseLocationLabels } from '@/src/features/exercise/exerciseData';
import { postureFor } from '@/src/features/exercise/postureMatch';

// Today's routine, all of it. What it reads and starts is unchanged.
export default function ExerciseSummaryScreen() {
  const router = useRouter();
  const { condition, homeLoadState, refreshHome, routine, selectPlanSession, startRoutine } =
    useExerciseRoutine();
  const { beginSession } = useExerciseSession();
  const [isStarting, setIsStarting] = useState(false);
  const goBack = useCallback(() => router.dismissTo('/exercise'), [router]);
  // Only moves the server has validated for posture analysis get 자세 촬영 (the team's five, 11/15), never a name guess.
  const [postureList, setPostureList] = useState<PostureCapability[]>([]);
  useEffect(() => {
    let active = true;
    void getPostureCapabilities()
      .then((data) => { if (active) setPostureList(data.exercises); })
      .catch(() => undefined); // no list, no button
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (routine) return undefined;
    const frame = requestAnimationFrame(() => {
      void refreshHome();
    });
    return () => cancelAnimationFrame(frame);
  }, [refreshHome, routine]);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  const selectedPlan = routine?.planSessions.find(
    (plan) => plan.id === routine.selectedPlanSessionId,
  );
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const canStart =
    Boolean(routine) &&
    (!selectedPlan ||
      (selectedPlan.scheduledDate <= today &&
        !['completed', 'skipped'].includes(selectedPlan.status)));

  const handleStart = async () => {
    if (!routine || !canStart || isStarting) return;
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

  const duration = routine?.totalDurationMinutes ?? condition.availableMinutes;
  const meta = [
    duration === null ? null : `${duration}분`,
    routine?.estimatedCalories == null ? null : `약 ${routine.estimatedCalories}kcal`,
    routine?.intensity ? `강도 ${exerciseIntensityLabels[routine.intensity] ?? routine.intensity}` : null,
  ];
  const made = [
    condition.availableMinutes === null ? null : `${condition.availableMinutes}분`,
    condition.location ? exerciseLocationLabels[condition.location] : null,
    condition.location
      ? condition.equipment.length
        ? condition.equipment.map((item) => exerciseEquipmentLabels[item]).join(', ')
        : '기구 없음'
      : null,
    condition.condition ? `컨디션 ${condition.condition}` : null,
  ];
  const join = (parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

  return (
    <RoutinePlanView
      button={{
        disabled: !canStart || isStarting,
        label: isStarting
          ? '시작하는 중…'
          : selectedPlan?.status === 'completed'
            ? '완료한 운동'
            : selectedPlan && selectedPlan.scheduledDate > today
              ? '예정된 운동'
              : '운동 시작하기',
      }}
      header={routine?.planSessions.length ? '요일별 운동 계획' : '오늘의 맞춤 운동'}
      loading={homeLoadState === 'loading'}
      onBack={goBack}
      onChange={() => router.push(routine ? { pathname: '/exercise/condition', params: { source: 'summary' } } : '/exercise/condition')}
      onPickDay={selectPlanSession}
      onPosture={(moveId) => {
        const pick = postureFor(postureList, routine?.exercises.find((item) => item.id === moveId));
        router.push(pick
          ? { pathname: '/exercise/posture-capture', params: { exerciseCode: pick.exercise_code, cameraView: pick.camera_view } }
          : '/exercise/posture-capture' as Href);
      }}
      onStart={() => void handleStart()}
      routine={routine ? {
        days: routine.planSessions.map((plan) => ({
          date: new Date(`${plan.scheduledDate}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }),
          id: plan.id,
          meta: `${plan.durationMinutes}분 · ${plan.exercises.length}개 운동`,
          name: plan.name,
          selected: plan.id === routine.selectedPlanSessionId,
          status: plan.status === 'completed' ? '완료' : plan.status === 'in_progress' ? '진행 중' : plan.scheduledDate > today ? '예정' : '시작 가능',
        })),
        listTitle: `${selectedPlan ? `${selectedPlan.name} · ` : ''}운동 ${routine.exercises.length}개`,
        made: join(made),
        meta: join(meta),
        moves: routine.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          demo: exercise.demoGifUrl && /^https:[/][/]/i.test(exercise.demoGifUrl) ? exercise.demoGifUrl : null,
          how: exercise.instruction?.trim() || null,
          posture: Boolean(postureFor(postureList, exercise)),
          text: exercise.prescription || '자세한 운동 방법은 시작 후 확인해 주세요.',
        })),
        reasons: routine.reasons.length ? routine.reasons : ['오늘 입력한 운동 시간과 장소, 컨디션을 바탕으로 추천했어요.'],
        source: routine.generator === 'auto-fit-ai' ? 'AI 모델 추천' : '기본 운동 추천',
        subtitle: routine.subtitle,
        title: routine.title,
      } : null}
    />
  );
}
