import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getApiErrorMessage } from '@/src/api/client';
import { getActiveExerciseGoal, getExerciseHistory, getExerciseSessionAnalysis, saveRecommendedWorkout } from '@/src/api/exercise';
import { getRunningApiErrorMessage, getRunningHistory, type RunningSession } from '@/src/api/running';
import { RecordView, type RecordMetric, type RecordViewProps } from '@/src/components/a/RecordView';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { chartActivity, chartTop, collectActivityDays, localDayKey, shiftDay, summarizeActivity } from '@/src/features/exercise/goalProgress';
import { canSaveRecommendedHistorySession } from '@/src/features/exercise/historyActions';
import { sessionCalories, sessionLocalDate, sessionMinutes } from '@/src/features/exercise/weeklyMetrics';
import { koreanDate } from '@/src/lib/koreanDate';

// The workout record: the app's 내 운동 and 진행 현황 as one screen (renewal A's a-record.html). What it reads and
// saves is unchanged: the goal, the workouts and runs of the period, a workout's analysis (rules, no AI call) and
// saving a recommended workout as my routine.
type HistoryRow = Awaited<ReturnType<typeof getExerciseHistory>>['history'][number];
type Goal = { goal_type: string; weekly_frequency: number; weekly_duration_minutes: number };
type Opened = { tell: string | null; next: string[]; failed: boolean } | 'loading';
const GOALS: Record<string, string> = {
  muscle_gain: '근육량 늘리기', weight_loss: '체중 감량하기', endurance: '체력 기르기',
  maintenance: '꾸준히 운동하기', rehabilitation: '무리 없이 회복하기',
};
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dayName = (key: string) => `${koreanDate(key)} ${WEEKDAYS[new Date(`${key}T12:00:00`).getDay()]}`;
const moveName = (log: unknown) => (log && typeof log === 'object' && 'exercise_name' in log ? String(log.exercise_name) : '');
// The server keeps no routine name with a workout: it is named by its first move.
const workoutName = (logs: unknown[]) => logs.length ? `${moveName(logs[0]) || '운동'}${logs.length > 1 ? ` 외 ${logs.length - 1}가지` : ''}` : '운동';
const workoutSub = (session: Record<string, unknown>) => {
  const minutes = sessionMinutes(session.total_duration_seconds);
  const calories = sessionCalories(session.total_calories_burned, session.completed_item_count);
  return [`${dayName(sessionLocalDate(session.started_at))}요일`, minutes ? `${Math.round(minutes)}분` : null, calories ? `${Math.round(calories)}kcal` : null];
};

export default function ExerciseHistory() {
  const router = useRouter();
  const { latestSession } = useExerciseRoutine();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<RecordMetric>('minutes');
  const [picked, setPicked] = useState<[string, string] | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const today = useMemo(() => new Date(), []);
  const start = useMemo(() => period === 'week'
    ? shiftDay(today, -((today.getDay() + 6) % 7) + offset * 7)
    : new Date(today.getFullYear(), today.getMonth() + offset, 1, 12), [today, period, offset]);
  const end = useMemo(() => period === 'week'
    ? shiftDay(start, 6)
    : new Date(start.getFullYear(), start.getMonth() + 1, 0, 12), [start, period]);
  // A day either side: the server counts days in UTC, the screen in local days.
  const from = localDayKey(shiftDay(start, -1));
  const to = localDayKey(shiftDay(end, 1));

  useFocusEffect(useCallback(() => {
    void retry; // 다시 시도 reads everything again
    let active = true;
    void Promise.all([getActiveExerciseGoal(), getExerciseHistory(from, to), getRunningHistory(from, to)])
      .then(([goalResponse, exerciseResponse, runningResponse]) => {
        if (!active) return;
        setGoal((goalResponse.goal ?? null) as Goal | null);
        setRows(exerciseResponse.history ?? []);
        setRuns(runningResponse.sessions ?? []);
        setError('');
      })
      .catch((cause) => { if (active) setError(getRunningApiErrorMessage(cause) || getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, retry]));

  const week = period === 'week';
  const first = localDayKey(start);
  const last = localDayKey(end);
  const days = collectActivityDays(rows, runs);
  const summary = summarizeActivity(days, start, end);
  const bars = chartActivity(days, start, end, period);
  const span = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const unit = metric === 'workouts' ? '회' : '분';
  const target = !goal || metric === 'runningMinutes' ? 0
    : (metric === 'minutes' ? goal.weekly_duration_minutes : goal.weekly_frequency) * (week ? 1 : Math.ceil(span / 7));
  const value = summary[metric];
  // A week's bars are days and a month's are weeks, so the line is the goal of one bar. A day's share of a few workouts is no use.
  const lineValue = !goal ? 0
    : metric === 'minutes' ? goal.weekly_duration_minutes / (week ? 7 : 1)
      : metric === 'workouts' && !week ? goal.weekly_frequency : 0;
  const top = chartTop(Math.max(lineValue, ...bars.map((bar) => bar[metric])), metric === 'workouts' ? 2 : 30);
  const todayKey = localDayKey(today);
  const columns = bars.map((bar, index) => {
    const a = localDayKey(shiftDay(start, week ? index : index * 7));
    const b = week ? a : localDayKey(shiftDay(start, Math.min(index * 7 + 6, span - 1)));
    const amount = bar[metric];
    return {
      a, b, key: a, label: bar.label, now: todayKey >= a && todayKey <= b, picked: picked?.[0] === a,
      name: week ? `${dayName(a)}요일` : `${koreanDate(a)}부터 ${koreanDate(b)}`,
      text: `${Math.round(amount)}${unit}`, value: amount,
    };
  });

  // The list: every workout and run of the period (or of the bar picked), newest first.
  const [listFrom, listTo] = picked ?? [first, last];
  const inList = (date: string) => date >= listFrom && date <= listTo;
  const shown = [
    ...rows.filter(({ session }) => inList(sessionLocalDate(session.started_at))).map((row) => ({ at: String(row.session.started_at), row, run: null })),
    ...runs.filter((run) => run.status === 'completed' && inList(sessionLocalDate(run.started_at))).map((run) => ({ at: run.started_at, row: null, run })),
  ].sort((left, right) => right.at.localeCompare(left.at));
  const inPeriod = rows.filter(({ session }) => { const date = sessionLocalDate(session.started_at); return date >= first && date <= last; });
  const kcal = inPeriod.filter(({ session }) => session.status === 'completed')
    .map(({ session }) => sessionCalories(session.total_calories_burned, session.completed_item_count));
  const runKcal = runs.filter((run) => run.status === 'completed' && sessionLocalDate(run.started_at) >= first && sessionLocalDate(run.started_at) <= last)
    .reduce((total, run) => total + number(run.calories_burned), 0);
  const kcalTotal = kcal.reduce<number>((total, item) => total + (item ?? 0), 0) + runKcal;

  const openRow = (key: string) => {
    const run = runs.find((item) => item.running_session_id === key);
    if (run) {
      router.push({ pathname: '/exercise/run-result', params: { sessionId: run.running_session_id, from: 'history' } });
      return;
    }
    setOpenId(key);
    setSaveError('');
    const row = rows.find(({ session }) => String(session.exercise_session_id) === key);
    if (!row?.feedback || opened[key]) return;
    setOpened((now) => ({ ...now, [key]: 'loading' }));
    void getExerciseSessionAnalysis(key)
      .then(({ analysis }) => setOpened((now) => ({ ...now, [key]: { failed: false, next: analysis.next_session_adjustments, tell: analysis.insights.join(' ') || null } })))
      .catch(() => setOpened((now) => ({ ...now, [key]: { failed: true, next: [], tell: null } })));
  };
  const save = async (session: HistoryRow['session']) => {
    const id = session.exercise_recommendation_id;
    if (!canSaveRecommendedHistorySession(session) || typeof id !== 'string') return;
    setSavingId(id);
    setSaveError('');
    try {
      await saveRecommendedWorkout(id, `${koreanDate(sessionLocalDate(session.started_at))} 운동`);
      setSavedIds((current) => [...current, id]);
    } catch (cause) {
      setSaveError(getApiErrorMessage(cause));
    } finally {
      setSavingId(null);
    }
  };

  const openRowData = rows.find(({ session }) => String(session.exercise_session_id) === openId);
  let sheet: RecordViewProps['sheet'] = null;
  if (openRowData) {
    const { session, logs } = openRowData;
    const id = typeof session.exercise_recommendation_id === 'string' ? session.exercise_recommendation_id : null;
    const stopped = session.status !== 'completed';
    const result = opened[String(session.exercise_session_id)];
    const ready = result && result !== 'loading' ? result : null;
    const canSave = canSaveRecommendedHistorySession(session);
    // What goes into the next workout is only true of the latest one.
    const latest = latestSession?.sessionId === String(session.exercise_session_id);
    sheet = {
      lead: [...workoutSub(session), stopped ? '중단' : null].filter(Boolean).join(' · '),
      moves: logs.map((log) => {
        const item = (log ?? {}) as Record<string, unknown>;
        const skipped = item.skipped === true;
        const sets = number(item.completed_sets);
        const reps = number(item.performed_repetitions);
        return { name: moveName(log) || '운동', skipped, text: skipped ? '건너뜀' : [sets ? `${sets}세트` : null, reps ? `${reps}회` : null].filter(Boolean).join(' · ') || '했어요' };
      }),
      next: latest && ready ? ready.next : [],
      note: saveError
        || (session.recommendation_generator === 'legacy' ? '이전 추천 기록이라 내 루틴으로 저장할 수 없어요.' : null)
        || (!stopped && id && !canSave && session.recommendation_generator !== 'legacy' ? '추천 정보를 확인할 수 없어 지금은 저장할 수 없어요.' : null)
        || (ready?.failed ? '운동 분석을 불러오지 못했어요.' : null),
      save: canSave && id ? {
        disabled: savingId === id || savedIds.includes(id),
        label: savedIds.includes(id) ? '내 루틴에 저장됨' : savingId === id ? '저장 중…' : '내 루틴으로 저장',
        onPress: () => void save(session),
      } : null,
      tell: ready?.tell ?? null,
      title: workoutName(logs),
    };
  }

  const reset = () => { setLoading(true); setPicked(null); };
  const lastLabel = last.slice(0, 7) === first.slice(0, 7) ? `${Number(last.slice(8))}일` : koreanDate(last);
  return (
    <RecordView
      bars={columns}
      canForward={offset < 0}
      error={error ? { onRetry: () => { setLoading(true); setRetry((now) => now + 1); }, text: error } : null}
      goal={goal ? `${GOALS[goal.goal_type] ?? '운동 목표'} · 주 ${goal.weekly_duration_minutes}분 · 주 ${goal.weekly_frequency}회` : null}
      left={target ? `목표 ${Math.round(target)}${unit}${value >= target ? ' · 목표 달성' : offset < 0 ? '' : ` · ${Math.ceil(target - value)}${unit} 남음`}` : ''}
      line={lineValue ? { label: `${week ? '하루' : '한 주'} ${Math.round(lineValue)}${unit}`, value: lineValue } : null}
      listTitle={picked ? (picked[0] === picked[1] ? `${dayName(picked[0])}요일` : `${koreanDate(picked[0])} – ${koreanDate(picked[1])}`) : `${week ? (offset ? '그 주' : '이번 주') : (offset ? '그 달' : '이번 달')} 운동 ${shown.length}번`}
      loading={loading}
      metric={metric}
      onAll={() => setPicked(null)}
      onBack={() => router.back()}
      onBar={(key) => { const column = columns.find((item) => item.key === key); setPicked(picked?.[0] === key || !column ? null : [column.a, column.b]); }}
      onCloseSheet={() => setOpenId(null)}
      onGoal={() => router.push('/exercise/goal')}
      onMetric={setMetric}
      onMove={(step) => { reset(); setOffset((now) => now + step); }}
      onPeriod={(next) => { if (next !== period || offset !== 0) reset(); setPeriod(next); setOffset(0); }}
      onRow={openRow}
      period={period}
      range={week ? `${koreanDate(start)} – ${lastLabel}` : `${start.getFullYear()}년 ${start.getMonth() + 1}월`}
      rows={shown.map(({ row, run }) => run ? {
        key: run.running_session_id, stopped: false,
        sub: `${dayName(sessionLocalDate(run.started_at))}요일 · ${Math.round(number(run.elapsed_seconds) / 60)}분`,
        title: `러닝 ${(number(run.distance_meters) / 1000).toFixed(2)}km`,
      } : {
        key: String(row!.session.exercise_session_id),
        stopped: row!.session.status !== 'completed',
        sub: workoutSub(row!.session).filter(Boolean).join(' · '),
        title: workoutName(row!.logs),
      })}
      sheet={sheet}
      showAll={Boolean(picked)}
      sums={[
        ['운동한 날', `${summary.activeDays}일`],
        ['한 번에 평균', `${summary.workouts ? Math.round(summary.minutes / summary.workouts) : 0}분`],
        ['쓴 열량', kcalTotal ? `${Math.round(kcalTotal)}kcal` : '—'],
      ]}
      top={top}
      value={`${Math.round(value)}${unit}`}
    />
  );
}
