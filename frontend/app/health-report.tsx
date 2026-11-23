import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { getDietNutritionSummary } from '@/src/api/diet';
import { getExerciseHistory } from '@/src/api/exercise';
import { getHealthReport } from '@/src/api/healthReport';
import { getHome } from '@/src/api/home';
import { getHabitTierProgress } from '@/src/api/tier';
import type { ReportTrend } from '@/src/components/a/ReportViews';
import { ReportView } from '@/src/components/b/ReportView';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';
import { readQuestLog, WATER_GOAL } from '@/src/features/a/dailyQuests';
import { readSteps, STEP_GOAL } from '@/src/features/a/useSteps';
import { countWeek, regionParts, weekFrame, weightLine, type WeekCount } from '@/src/features/a/weekReport';
import { sessionLocalDate, sessionMinutes } from '@/src/features/exercise/weeklyMetrics';
import { nutritionNumber } from '@/src/features/nutritionSummary';
import { tierLook, type TierLook } from '@/src/features/tier/tierLook';
import { useAppTheme } from '@/src/theme';

type Loaded = { count: WeekCount; trend: ReportTrend; tier: TierLook | null; name: string };

const quiet = <T,>(promise: Promise<T>) => promise.catch(() => null);
// A workout's exercises that were done, by name, with the parts the server stored (null on older records).
const doneMoves = (logs: unknown[]) =>
  logs.flatMap((log) => {
    const row = log as { exercise_name?: unknown; completed?: unknown; body_regions?: unknown } | null;
    return row && typeof row.exercise_name === 'string' && row.completed !== false
      ? [{ name: row.exercise_name, parts: regionParts(row.body_regions) }]
      : [];
  });

// Everything the report shows, read once: this week's workouts and each day's food from the server, water,
// stretching and steps from this phone. No part of it asks an AI. A source that fails is left empty; only
// when the server answers nothing at all is the report "not loaded".
async function loadReport(): Promise<Loaded | null> {
  const frame = weekFrame(new Date());
  const lived = frame.filter((day) => day.state !== 'later');
  const [report, home, tier, history, meals, quests, steps] = await Promise.all([
    quiet(getHealthReport()),
    quiet(getHome()),
    quiet(getHabitTierProgress()),
    quiet(getExerciseHistory(lived[0].key, lived[lived.length - 1].key)),
    Promise.all(lived.map((day) => quiet(getDietNutritionSummary(day.key)))),
    readQuestLog(),
    readSteps(lived.map((day) => day.key)),
  ]);
  if (!report && !home && !tier && !history && meals.every((meal) => !meal)) return null;

  const sessions = (history?.history ?? []).filter((row) => row.session.status === 'completed');
  const days = frame.map((day, index) => {
    const mine = sessions.filter((row) => sessionLocalDate(row.session.started_at) === day.key);
    const moves = mine.flatMap((row) => doneMoves(row.logs));
    const food = meals[index]?.summary; // meals has the days lived, in the frame's order
    return {
      ...day,
      minutes: mine.length ? mine.reduce((sum, row) => sum + (sessionMinutes(row.session.total_duration_seconds) ?? 0), 0) : null,
      exercises: moves.map((move) => move.name),
      regions: Object.fromEntries(moves.flatMap((move) => (move.parts ? [[move.name, move.parts]] : []))),
      kcal: nutritionNumber(food?.calories.consumed),
      kcalGoal: nutritionNumber(food?.calories.target),
      protein: nutritionNumber(food?.protein.consumed),
      proteinGoal: nutritionNumber(food?.protein.target),
      steps: steps?.[day.key] ?? null,
      water: quests[day.key]?.water ?? null,
      stretch: quests[day.key]?.stretch ?? false,
    };
  });
  const score = home?.health_score.score;
  return {
    count: countWeek(days, { steps: STEP_GOAL, water: WATER_GOAL }),
    trend: {
      weight: weightLine([
        ...(report?.body_compositions ?? []).map((row) => ({ date: row.measured_at, kg: row.weight_kg })),
        ...(report?.health_checkups ?? []).map((row) => ({ date: row.checkup_date, kg: row.weight_kg })),
      ]),
      score: typeof score === 'number' ? { value: score, change: home?.score_change.change ?? null } : null,
    },
    tier: tier ? tierLook(tier.progress) : null,
    name: home?.user_name.trim() || '회원',
  };
}

// Renewal B's report: one page of story cards (src/components/b/ReportView.tsx) over the same week the
// renewal A report counted. The measurements themselves, kind by kind, are one tap further (app/health-records.tsx).
export default function ReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadReport().then((loaded) => {
        if (!active) return;
        if (loaded) setData(loaded);
        setFailed(!loaded);
      });
      return () => {
        active = false;
      };
      // Trying again makes a new callback, so an answer to the old request is dropped.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]),
  );

  if (!data) {
    return failed ? (
      <R6ConnectionError
        offline
        onRetry={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
      />
    ) : (
      <View style={{ alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    );
  }
  return (
    <ReportView
      count={data.count}
      onAsk={(question) => router.push(question ? { pathname: '/chat', params: { ask: question } } : '/chat')}
      onBack={() => router.back()}
      onGo={(tab) => router.push(`/${tab}`)}
      onHistory={() => router.push('/exercise/history')}
      onRecords={() => router.push('/health-records')}
      onTier={() => router.push('/tier')}
      onUpload={() => router.push('/upload')}
      tier={data.tier}
      trend={data.trend}
    />
  );
}
