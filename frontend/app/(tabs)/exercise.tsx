import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getExerciseHistory } from '@/src/api/exercise';
import { ExerciseHomeView } from '@/src/components/exercise/ExerciseHomeView';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import {
  localDateKey,
  mondayOf,
  summarizeWeek,
  sundayOf,
  weekdayLabels,
} from '@/src/features/home/homeSummary';

const shortDate = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

function recentDetail(session: {
  date: string | null;
  durationMinutes: number | null;
  itemCount: number | null;
  calories: number | null;
}) {
  const parts: string[] = [];
  const date = session.date ? new Date(session.date) : null;
  if (date && !Number.isNaN(date.getTime()))
    parts.push(`${date.getMonth() + 1}월 ${date.getDate()}일`);
  if (session.durationMinutes !== null) parts.push(`${Math.round(session.durationMinutes)}분`);
  if (session.itemCount !== null) parts.push(`${session.itemCount}가지`);
  if (session.calories !== null) parts.push(`${Math.round(session.calories)}kcal`);
  return parts.join(' · ');
}

export default function ExerciseScreen() {
  const router = useRouter();
  const {
    condition,
    homeError,
    homeMetrics,
    latestSession,
    refreshHome,
    resultRecordCompleted,
    routine,
    setCondition,
    status,
  } = useExerciseRoutine();
  const [week, setWeek] = useState({
    doneDays: Array(7).fill(false) as boolean[],
    minutes: null as number | null,
  });
  const today = new Date();

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void refreshHome();
      const now = new Date();
      void getExerciseHistory(localDateKey(mondayOf(now)), localDateKey(sundayOf(now)))
        .then((response) => {
          if (live) setWeek(summarizeWeek(response.history ?? [], now));
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [refreshHome]),
  );

  const state = status ?? 'loading';
  const onPrimary = () => {
    if (state === 'completed')
      router.push(
        resultRecordCompleted
          ? { pathname: '/exercise/ai-report', params: { source: 'home' } }
          : { pathname: '/exercise/result', params: { source: 'home' } },
      );
    else if (state === 'ready') router.push('/exercise/summary');
    else if (state !== 'loading') router.push('/exercise/condition');
  };

  return (
    <ExerciseHomeView
      error={homeError}
      location={condition.location}
      onLocationChange={(location) => setCondition({ ...condition, location })}
      onOpenGoal={() => router.push('/exercise/goal')}
      onOpenProgress={() => router.push('/exercise/history')}
      onOpenRecent={() => router.push('/exercise/history')}
      onPrimary={onPrimary}
      onRecommendAgain={() => router.push('/exercise/condition')}
      onRetry={() => void refreshHome()}
      recent={
        latestSession
          ? {
              title: state === 'completed' && routine ? routine.title : '지난 운동',
              detail: recentDetail(latestSession),
            }
          : null
      }
      routine={
        routine
          ? {
              title: routine.title,
              minutes: routine.totalDurationMinutes,
              count: routine.exercises.length,
              kcal: routine.estimatedCalories,
            }
          : null
      }
      state={state}
      week={{
        rangeLabel: `${shortDate(mondayOf(today))} ~ ${shortDate(sundayOf(today))}`,
        count: homeMetrics.currentWeekWorkoutCount,
        target: homeMetrics.targetWorkoutCount,
        percent: homeMetrics.goalAchievementRate,
        doneDayLabels: weekdayLabels.filter((_, index) => week.doneDays[index]),
        minutes: week.minutes,
      }}
    />
  );
}
