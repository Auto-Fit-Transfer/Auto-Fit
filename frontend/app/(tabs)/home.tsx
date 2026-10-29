import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getDietNutritionSummary } from '@/src/api/diet';
import { getExerciseHistory } from '@/src/api/exercise';
import { getHome } from '@/src/api/home';
import { HomeView, useOpenChat, type HomeViewProps } from '@/src/components/home';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { sessionLocalDate } from '@/src/features/exercise/weeklyMetrics';
import {
  koreanDateLabel,
  localDateKey,
  mondayOf,
  summarizeWeek,
  sundayOf,
  weekdayIndex,
} from '@/src/features/home/homeSummary';
import { nutritionNumber } from '@/src/features/nutritionSummary';
import { getSupabaseClient } from '@/src/lib/supabase';

const fallbackUserName = '회원';

type ApiRecord = Record<string, unknown>;

function isApiRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function getSessionUserName() {
  try {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    const metadata = session?.user?.user_metadata;
    if (!isApiRecord(metadata)) return undefined;
    for (const key of ['full_name', 'name']) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const openChat = useOpenChat();
  const { homeMetrics, latestSession, refreshHome, routine, status } = useExerciseRoutine();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(fallbackUserName);
  const [health, setHealth] = useState<HomeViewProps['health']>(null);
  const [diet, setDiet] = useState<HomeViewProps['diet']>({ consumed: null, target: null });
  const [week, setWeek] = useState({
    doneDays: Array(7).fill(false) as boolean[],
    minutes: null as number | null,
  });
  const isMountedRef = useRef(true);
  const today = new Date();

  const load = useCallback(async () => {
    const now = new Date();
    const [home, nutrition, history] = await Promise.allSettled([
      getHome(),
      getDietNutritionSummary(localDateKey(now)),
      getExerciseHistory(localDateKey(mondayOf(now)), localDateKey(sundayOf(now))),
    ]);
    if (!isMountedRef.current) return;

    if (home.status === 'fulfilled') {
      const { health_score: score, score_change: change, user_name: name } = home.value;
      setHealth(
        score.score === null
          ? null
          : { score: score.score, total: score.total_score, change: change.change },
      );
      if (name.trim()) setUserName(name.trim());
      else void getSessionUserName().then((n) => n && isMountedRef.current && setUserName(n));
    } else {
      console.error('Home request failed:', home.reason);
      void getSessionUserName().then((n) => n && isMountedRef.current && setUserName(n));
    }
    if (nutrition.status === 'fulfilled') {
      const calories = nutrition.value.summary.calories;
      setDiet({
        consumed: nutritionNumber(calories.consumed),
        target: nutritionNumber(calories.target),
      });
    }
    if (history.status === 'fulfilled') setWeek(summarizeWeek(history.value.history ?? [], now));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      void refreshHome();
      const frame = requestAnimationFrame(() => void load());
      return () => {
        isMountedRef.current = false;
        cancelAnimationFrame(frame);
      };
    }, [load, refreshHome]),
  );

  const doneToday =
    status === 'completed' &&
    latestSession &&
    sessionLocalDate(latestSession.date) === localDateKey(today)
      ? latestSession.durationMinutes
      : null;

  return (
    <HomeView
      dateLabel={koreanDateLabel(today)}
      diet={diet}
      exercise={{
        status,
        doneMinutes: doneToday,
        plannedMinutes: routine?.totalDurationMinutes ?? latestSession?.durationMinutes ?? null,
      }}
      health={health}
      loading={loading}
      onAskQwony={openChat}
      onOpenAnalysis={() =>
        router.push({ pathname: '/total-analysis', params: { source: 'home' } })
      }
      onOpenDiet={() => router.push('/diet')}
      onOpenExercise={() => router.push('/exercise')}
      onOpenNotifications={() => router.push('/community/notifications')}
      onOpenTier={() => router.push('/tier')}
      onStartExercise={() => router.push('/exercise/condition')}
      onUploadData={() => router.push('/upload')}
      userName={userName}
      week={{
        count: homeMetrics.currentWeekWorkoutCount,
        target: homeMetrics.targetWorkoutCount,
        doneDays: week.doneDays,
        todayIndex: weekdayIndex(today),
        minutes: week.minutes,
      }}
    />
  );
}
