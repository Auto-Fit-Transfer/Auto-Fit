import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { getExerciseApiErrorMessage, saveExerciseSessionFeedback } from '@/src/api/exercise';
import { getHabitTierProgress } from '@/src/api/tier';
import { useKeptWho } from '@/src/components/a/useKeptWho';
import { WorkoutDoneView, type PostCondition } from '@/src/components/a/WorkoutDoneView';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { tierLook, type TierLook } from '@/src/features/tier/tierLook';

// The workout's result. What it saves is unchanged: how hard it felt and where it hurt, once.
// How hard it felt is no longer filled in for me: leaving without an answer saves nothing.
export default function ExerciseCompletionScreen() {
  const router = useRouter();
  const who = useKeptWho();
  const { latestSession, markResultRecordCompleted, refreshHome, resultRecordCompleted, routine } = useExerciseRoutine();
  const { clearSession, session, summary, workoutPoints } = useExerciseSession();
  const [tier, setTier] = useState<TierLook | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [hadPain, setHadPain] = useState(false);
  const [change, setChange] = useState<PostCondition>('normal');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const sessionId = latestSession?.sessionId ?? session?.sessionId;
  const duration = latestSession?.durationMinutes ?? (session ? summary.durationMinutes : null);
  const count = latestSession?.itemCount ?? (session ? summary.completedCount : null);

  useEffect(() => { if (!sessionId) void refreshHome(); }, [refreshHome, sessionId]);
  useEffect(() => {
    let active = true;
    void getHabitTierProgress().then(({ progress }) => { if (active) setTier(tierLook(progress)); }, () => undefined);
    return () => { active = false; };
  }, []);
  const goHome = useCallback(() => { clearSession(); router.dismissTo('/exercise'); }, [clearSession, router]);
  const save = async () => {
    if (saving) return;
    if (!sessionId) { Alert.alert('운동 기록을 찾지 못했어요', '운동 홈에서 다시 확인해 주세요.'); return; }
    if (resultRecordCompleted) { router.replace('/exercise/ai-report'); return; }
    if (difficulty === null) { goHome(); return; }
    setSaving(true);
    try {
      await saveExerciseSessionFeedback(sessionId, {
        note: null,
        perceivedDifficulty: difficulty,
        postCondition: hadPain ? change : 'good',
        uncomfortableAreas: hadPain ? selectedAreas : [],
      });
      markResultRecordCompleted();
      goHome();
    } catch (error) {
      Alert.alert('운동 느낌을 저장하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // A line a move, from this session: once the app was closed only the totals are left.
  const rows = (session?.exercises ?? []).map((exercise) => {
    const result = session?.results.find((item) => item.sessionItemId === exercise.sessionItemId);
    const done = result?.completedSets ?? 0;
    const amount = exercise.mode === 'reps' ? `${exercise.targetRepetitions ?? 0}회` : `${exercise.targetSeconds ?? 0}초`;
    return {
      name: exercise.name,
      text: done === 0 ? (result?.skipped ? '건너뜀' : '하지 않음') : `${done < exercise.totalSets ? `${exercise.totalSets}세트 중 ${done}세트` : `${done}세트`} · ${amount}`,
    };
  });
  const throughout = session ? session.results.length >= session.exercises.length : false;

  return (
    <WorkoutDoneView
      areas={selectedAreas}
      button={{ disabled: saving || !sessionId, label: saving ? '저장 중…' : resultRecordCompleted ? '분석 보기' : '완료' }}
      change={change}
      count={count}
      difficulty={difficulty}
      finished={count === null || count > 0}
      hadPain={hadPain}
      kcal={session ? summary.calories : null}
      minutes={duration}
      noPoints={workoutPoints === 'not_awarded'}
      onBack={goHome}
      onChange={setChange}
      onDifficulty={setDifficulty}
      onDone={() => void save()}
      onHadPain={setHadPain}
      onHistory={() => router.push('/exercise/history')}
      onShare={sessionId ? () => router.push({ pathname: '/community/compose', params: { share: sessionId } }) : undefined}
      onToggleArea={(area) => setSelectedAreas((current) => (current.includes(area) ? current.filter((item) => item !== area) : [...current, area]))}
      rows={rows}
      stars={session && throughout ? [true, !session.results.some((result) => result.skipped)] : null}
      tier={tier}
      tierIndex={tier?.index ?? 0}
      title={routine?.title ?? '오늘의 운동'}
      who={who}
    />
  );
}
