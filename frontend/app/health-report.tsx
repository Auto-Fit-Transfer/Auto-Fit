import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { BackHandler } from 'react-native';

import { getDietNutritionSummary } from '@/src/api/diet';
import { getExerciseHistory } from '@/src/api/exercise';
import { getHealthReport } from '@/src/api/healthReport';
import { getHome } from '@/src/api/home';
import { getHabitTierProgress } from '@/src/api/tier';
import { ALoading } from '@/src/components/a/ALoading';
import { ReportDetailView, ReportSummaryView, type ReportTrend } from '@/src/components/a/ReportViews';
import { useKeptWho } from '@/src/components/a/useKeptWho';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';
import { readQuestLog, WATER_GOAL } from '@/src/features/a/dailyQuests';
import { readSteps, STEP_GOAL } from '@/src/features/a/useSteps';
import { countWeek, weekFrame, weightLine, type WeekCount } from '@/src/features/a/weekReport';
import { sessionLocalDate, sessionMinutes } from '@/src/features/exercise/weeklyMetrics';
import { nutritionNumber } from '@/src/features/nutritionSummary';
import { tierLook, type TierLook } from '@/src/features/tier/tierLook';

type Loaded = { count: WeekCount; trend: ReportTrend; tier: TierLook | null; name: string };

const quiet = <T,>(promise: Promise<T>) => promise.catch(() => null);
// A workout's exercises that were done, by name.
const doneNames = (logs: unknown[]) =>
  logs.flatMap((log) => {
    const row = log as { exercise_name?: unknown; completed?: unknown } | null;
    return row && typeof row.exercise_name === 'string' && row.completed !== false ? [row.exercise_name] : [];
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
    const food = meals[index]?.summary; // meals has the days lived, in the frame's order
    return {
      ...day,
      minutes: mine.length ? mine.reduce((sum, row) => sum + (sessionMinutes(row.session.total_duration_seconds) ?? 0), 0) : null,
      exercises: mine.flatMap((row) => doneNames(row.logs)),
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

// Renewal A's report: the week counted up (결산), then the character's status sheet (자세히).
// The measurements themselves, kind by kind, are one tap further (app/health-records.tsx).
export default function ReportScreen() {
  const router = useRouter();
  const who = useKeptWho();
  const [view, setView] = useState<'sum' | 'detail'>('sum');
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [counted, setCounted] = useState(false); // the week is counted up once, not again on coming back from 자세히

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

  // The phone's back button on 자세히 goes to 결산, not out of the report.
  useFocusEffect(
    useCallback(() => {
      if (view !== 'detail') return undefined;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        setView('sum');
        return true;
      });
      return () => back.remove();
    }, [view]),
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
      <ALoading />
    );
  }
  const tierIndex = data.tier?.index ?? 0;
  return view === 'sum' ? (
    <ReportSummaryView
      count={data.count}
      onBack={() => router.back()}
      onHistory={() => router.push('/exercise/history')}
      onMore={() => {
        setCounted(true);
        setView('detail');
      }}
      onRecords={() => router.push('/health-records')}
      onTier={() => router.push('/tier')}
      onUpload={() => router.push('/upload')}
      still={counted}
      tier={data.tier}
      tierIndex={tierIndex}
      trend={data.trend}
      who={who}
    />
  ) : (
    <ReportDetailView
      count={data.count}
      name={data.name}
      onAsk={(question) => router.push({ pathname: '/chat', params: { ask: question } })}
      onBack={() => setView('sum')}
      onGo={(tab) => router.push(`/${tab}`)}
      onTier={() => router.push('/tier')}
      tier={data.tier}
      tierIndex={tierIndex}
      who={who}
    />
  );
}
