import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { completeExerciseSession, recordExerciseItemResult } from '@/src/api/exercise';
import { awardTierActivity } from '@/src/api/tier';

import type { StartedExerciseSession } from './ExerciseRoutineContext';
import type { ExerciseItem, ExerciseRoutine } from './exerciseData';

const DEFAULT_REST_SECONDS = 30;
const COUNT_INTERVALS = {
  fast: 1200,
  normal: 1800,
  slow: 2400,
} as const;

type ApiRecord = Record<string, unknown>;
export type ExerciseCountSpeed = keyof typeof COUNT_INTERVALS;
export type ExerciseSessionPhase =
  'exercise' | 'rest' | 'exercise-completed' | 'all-completed' | 'all-skipped';
export type ExerciseSessionMode = 'reps' | 'timed';

export type ExerciseSessionExercise = ExerciseItem & {
  mode: ExerciseSessionMode;
  sessionItemId: string;
  targetRepetitions: number | null;
  targetSeconds: number | null;
  totalSets: number;
};

export type ExerciseSessionResult = {
  caloriesBurned: number | null;
  completed: boolean;
  completedSets: number;
  elapsedSeconds: number;
  exerciseId: string;
  name: string;
  performedRepetitions: number | null;
  performedWeightKg: number | null;
  sessionItemId: string;
  skipped: boolean;
};

export type ExerciseSessionState = {
  countSpeed: ExerciseCountSpeed;
  currentExerciseIndex: number;
  currentRep: number;
  currentSet: number;
  elapsedExerciseMs: number;
  exercises: ExerciseSessionExercise[];
  exitConfirmationVisible: boolean;
  guideEnabled: boolean;
  lastTickAt: number | null;
  paused: boolean;
  phase: ExerciseSessionPhase;
  repAccumulatorMs: number;
  restRemainingMs: number;
  restTotalMs: number;
  results: ExerciseSessionResult[];
  sessionId: string;
  setRemainingMs: number;
  skipConfirmationVisible: boolean;
};

type ExerciseSessionSummary = {
  calories: number | null;
  completedCount: number;
  durationMinutes: number;
  skippedCount: number;
  totalElapsedSeconds: number;
};

type ExerciseSessionContextValue = {
  addRestSeconds: (seconds: number) => void;
  beginSession: (routine: ExerciseRoutine, startedSession: StartedExerciseSession) => void;
  clearSession: () => void;
  closeExitConfirmation: () => void;
  closeSkipConfirmation: () => void;
  completeCurrentSet: () => void;
  completeSession: () => Promise<ExerciseSessionSummary>;
  currentExercise: ExerciseSessionExercise | null;
  goToNextExercise: () => void;
  openExitConfirmation: () => void;
  openSkipConfirmation: () => void;
  session: ExerciseSessionState | null;
  skipRest: () => void;
  skipCurrentExercise: () => void;
  summary: ExerciseSessionSummary;
  toggleGuide: () => void;
  togglePause: () => void;
  cycleCountSpeed: () => void;
};

type ExerciseSessionAction =
  | { type: 'add-rest'; milliseconds: number }
  | { type: 'close-exit'; now: number }
  | { type: 'close-skip'; now: number }
  | { type: 'complete-set'; now: number }
  | { type: 'cycle-speed' }
  | { type: 'finish-rest'; now: number }
  | { type: 'next-exercise'; now: number }
  | { type: 'open-exit' }
  | { type: 'open-skip' }
  | { type: 'skip-exercise'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'toggle-guide' }
  | { type: 'toggle-pause'; now: number };

const ExerciseSessionContext = createContext<ExerciseSessionContextValue | null>(null);

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readNumber(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function getSessionId(session: ApiRecord) {
  return readString(session, ['exercise_session_id', 'session_id', 'id']);
}

function getStartedItemId(item: ApiRecord) {
  return readString(item, [
    'exercise_session_item_id',
    'session_item_id',
    'item_id',
    'id',
    'exercise_item_id',
  ]);
}

function findStartedItem(items: ApiRecord[], exercise: ExerciseItem, index: number) {
  return (
    items.find((item) => readString(item, ['exercise_item_id']) === exercise.id) ??
    items.find(
      (item) =>
        exercise.sequenceOrder !== null &&
        readNumber(item, ['sequence_order']) === exercise.sequenceOrder,
    ) ??
    items[index] ??
    null
  );
}

function normalizeExercises(
  routine: ExerciseRoutine,
  startedSession: StartedExerciseSession,
): ExerciseSessionExercise[] {
  const startedItems = startedSession.items.filter(isRecord);

  return routine.exercises.map((exercise, index) => {
    const startedItem = findStartedItem(startedItems, exercise, index);
    const sessionItemId = startedItem ? getStartedItemId(startedItem) : null;
    if (!sessionItemId) {
      throw new Error(`${exercise.name}의 세션 항목 정보를 확인할 수 없어요.`);
    }

    const isTimed =
      exercise.executionType === 'time_based' || exercise.targetDurationSeconds !== null;
    const targetSeconds = isTimed
      ? (exercise.targetDurationSeconds ??
        (exercise.durationMinutes === null ? null : Math.round(exercise.durationMinutes * 60)))
      : null;
    const targetRepetitions = isTimed ? null : exercise.repetitions;
    if (isTimed && (targetSeconds === null || targetSeconds <= 0)) {
      throw new Error(`${exercise.name}의 수행 시간 정보를 확인할 수 없어요.`);
    }
    if (!isTimed && (targetRepetitions === null || targetRepetitions <= 0)) {
      throw new Error(`${exercise.name}의 반복 횟수 정보를 확인할 수 없어요.`);
    }

    return {
      ...exercise,
      mode: isTimed ? 'timed' : 'reps',
      sessionItemId,
      targetRepetitions,
      targetSeconds,
      totalSets: Math.max(1, exercise.sets ?? 1),
    };
  });
}

function initialSetRemainingMs(exercise: ExerciseSessionExercise) {
  return exercise.mode === 'timed' ? (exercise.targetSeconds ?? 0) * 1000 : 0;
}

function buildResult(state: ExerciseSessionState, completed: boolean): ExerciseSessionResult {
  const exercise = state.exercises[state.currentExerciseIndex];
  const completedSets = completed ? exercise.totalSets : Math.max(0, state.currentSet - 1);
  const performedRepetitions =
    exercise.mode === 'reps'
      ? completedSets * (exercise.targetRepetitions ?? 0) + (completed ? 0 : state.currentRep)
      : null;

  return {
    caloriesBurned: exercise.caloriesBurned,
    completed,
    completedSets,
    elapsedSeconds: Math.max(0, Math.floor(state.elapsedExerciseMs / 1000)),
    exerciseId: exercise.id,
    name: exercise.name,
    performedRepetitions,
    performedWeightKg: exercise.targetWeightKg,
    sessionItemId: exercise.sessionItemId,
    skipped: !completed,
  };
}

function startExerciseAt(
  state: ExerciseSessionState,
  index: number,
  now: number,
): ExerciseSessionState {
  const exercise = state.exercises[index];
  return {
    ...state,
    currentExerciseIndex: index,
    currentRep: 0,
    currentSet: 1,
    elapsedExerciseMs: 0,
    exitConfirmationVisible: false,
    lastTickAt: now,
    paused: false,
    phase: 'exercise',
    repAccumulatorMs: 0,
    restRemainingMs: 0,
    restTotalMs: 0,
    setRemainingMs: initialSetRemainingMs(exercise),
    skipConfirmationVisible: false,
  };
}

function reducer(state: ExerciseSessionState, action: ExerciseSessionAction): ExerciseSessionState {
  const exercise = state.exercises[state.currentExerciseIndex];

  switch (action.type) {
    case 'tick': {
      if (
        state.paused ||
        state.exitConfirmationVisible ||
        state.skipConfirmationVisible ||
        (state.phase !== 'exercise' && state.phase !== 'rest')
      ) {
        return state.lastTickAt === null ? state : { ...state, lastTickAt: null };
      }
      if (state.lastTickAt === null) return { ...state, lastTickAt: action.now };
      const delta = Math.max(0, action.now - state.lastTickAt);
      if (state.phase === 'rest') {
        const nextState = {
          ...state,
          lastTickAt: action.now,
          restRemainingMs: Math.max(0, state.restRemainingMs - delta),
        };
        return nextState.restRemainingMs <= 0
          ? reducer(nextState, { now: action.now, type: 'finish-rest' })
          : nextState;
      }

      if (exercise.mode === 'timed') {
        const nextState = {
          ...state,
          elapsedExerciseMs: state.elapsedExerciseMs + delta,
          lastTickAt: action.now,
          setRemainingMs: Math.max(0, state.setRemainingMs - delta),
        };
        return nextState.setRemainingMs <= 0
          ? reducer(nextState, { now: action.now, type: 'complete-set' })
          : nextState;
      }

      const countInterval = COUNT_INTERVALS[state.countSpeed];
      const accumulated = state.repAccumulatorMs + delta;
      const increment = Math.floor(accumulated / countInterval);
      const targetRepetitions = exercise.targetRepetitions ?? 0;
      const currentRep = Math.min(targetRepetitions, state.currentRep + increment);
      const nextState = {
        ...state,
        currentRep,
        elapsedExerciseMs: state.elapsedExerciseMs + delta,
        lastTickAt: action.now,
        repAccumulatorMs: currentRep >= targetRepetitions ? 0 : accumulated % countInterval,
      };
      // 횟수 목표에 도달해도 화면 전환은 CTA의 complete-set 동작으로만 진행한다.
      return nextState;
    }
    case 'toggle-pause':
      if (state.phase !== 'exercise' && state.phase !== 'rest') return state;
      return {
        ...state,
        lastTickAt: state.paused ? action.now : null,
        paused: !state.paused,
      };
    case 'toggle-guide':
      return { ...state, guideEnabled: !state.guideEnabled };
    case 'cycle-speed':
      return {
        ...state,
        countSpeed:
          state.countSpeed === 'normal' ? 'fast' : state.countSpeed === 'fast' ? 'slow' : 'normal',
      };
    case 'complete-set': {
      if (state.phase !== 'exercise') return state;
      if (state.currentSet < exercise.totalSets) {
        const restMilliseconds = (exercise.restSeconds ?? DEFAULT_REST_SECONDS) * 1000;
        if (restMilliseconds <= 0) {
          return {
            ...state,
            currentRep: 0,
            currentSet: state.currentSet + 1,
            lastTickAt: action.now,
            repAccumulatorMs: 0,
            setRemainingMs: initialSetRemainingMs(exercise),
          };
        }
        return {
          ...state,
          lastTickAt: action.now,
          phase: 'rest',
          restRemainingMs: restMilliseconds,
          restTotalMs: restMilliseconds,
        };
      }

      return {
        ...state,
        lastTickAt: null,
        phase: 'exercise-completed',
        results: [...state.results, buildResult(state, true)],
      };
    }
    case 'finish-rest':
      if (state.phase !== 'rest') return state;
      return {
        ...state,
        currentRep: 0,
        currentSet: state.currentSet + 1,
        lastTickAt: action.now,
        phase: 'exercise',
        repAccumulatorMs: 0,
        restRemainingMs: 0,
        restTotalMs: 0,
        setRemainingMs: initialSetRemainingMs(exercise),
      };
    case 'add-rest':
      if (state.phase !== 'rest') return state;
      return {
        ...state,
        restRemainingMs: state.restRemainingMs + action.milliseconds,
        restTotalMs: state.restTotalMs + action.milliseconds,
      };
    case 'next-exercise':
      if (state.phase !== 'exercise-completed') return state;
      if (state.currentExerciseIndex >= state.exercises.length - 1) {
        return { ...state, lastTickAt: null, phase: 'all-completed' };
      }
      return startExerciseAt(state, state.currentExerciseIndex + 1, action.now);
    case 'open-skip':
      if (state.phase !== 'exercise' && state.phase !== 'rest') return state;
      return { ...state, lastTickAt: null, skipConfirmationVisible: true };
    case 'close-skip':
      return {
        ...state,
        lastTickAt: state.paused ? null : action.now,
        skipConfirmationVisible: false,
      };
    case 'skip-exercise': {
      const results = [...state.results, buildResult(state, false)];
      if (state.currentExerciseIndex < state.exercises.length - 1) {
        return startExerciseAt(
          { ...state, results, skipConfirmationVisible: false },
          state.currentExerciseIndex + 1,
          action.now,
        );
      }
      const completedCount = results.filter((result) => result.completed).length;
      return {
        ...state,
        lastTickAt: null,
        phase: completedCount === 0 ? 'all-skipped' : 'all-completed',
        results,
        skipConfirmationVisible: false,
      };
    }
    case 'open-exit':
      return { ...state, exitConfirmationVisible: true, lastTickAt: null };
    case 'close-exit':
      return {
        ...state,
        exitConfirmationVisible: false,
        lastTickAt:
          state.paused || (state.phase !== 'exercise' && state.phase !== 'rest')
            ? null
            : action.now,
      };
    default:
      return state;
  }
}

function summarizeSession(state: ExerciseSessionState | null): ExerciseSessionSummary {
  if (!state) {
    return {
      calories: null,
      completedCount: 0,
      durationMinutes: 0,
      skippedCount: 0,
      totalElapsedSeconds: 0,
    };
  }

  const completedResults = state.results.filter((result) => result.completed);
  const knownCalories = completedResults
    .map((result) => result.caloriesBurned)
    .filter((value): value is number => value !== null);
  const totalElapsedSeconds = state.results.reduce(
    (total, result) => total + result.elapsedSeconds,
    0,
  );

  return {
    calories:
      knownCalories.length === completedResults.length && knownCalories.length > 0
        ? knownCalories.reduce((total, value) => total + value, 0)
        : null,
    completedCount: completedResults.length,
    durationMinutes: Math.max(0, Math.round(totalElapsedSeconds / 60)),
    skippedCount: state.results.filter((result) => result.skipped).length,
    totalElapsedSeconds,
  };
}

export function ExerciseSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ExerciseSessionState | null>(null);
  const sessionRef = useRef<ExerciseSessionState | null>(null);
  const pendingWritesRef = useRef(new Set<Promise<void>>());
  const reportedResultsRef = useRef(new Set<string>());
  const completedSessionRef = useRef<{ sessionId: string; summary: ExerciseSessionSummary } | null>(
    null,
  );

  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const dispatch = useCallback((action: ExerciseSessionAction) => {
    setSession((current) => (current ? reducer(current, action) : current));
  }, []);

  const queueResult = useCallback((result: ExerciseSessionResult) => {
    const current = sessionRef.current;
    if (!current || reportedResultsRef.current.has(result.exerciseId)) return;
    reportedResultsRef.current.add(result.exerciseId);

    let task: Promise<void>;
    task = recordExerciseItemResult(current.sessionId, result.sessionItemId, {
      completed: result.completed,
      completedSets: result.completedSets,
      durationMinutes: Math.max(0, Math.round(result.elapsedSeconds / 60)),
      performedRepetitions: result.performedRepetitions,
      performedWeightKg: result.performedWeightKg,
      skipped: result.skipped,
    })
      .then(() => undefined)
      .catch((error) => {
        reportedResultsRef.current.delete(result.exerciseId);
        throw error;
      })
      .finally(() => {
        pendingWritesRef.current.delete(task);
      });
    pendingWritesRef.current.add(task);
    void task.catch(() => undefined);
  }, []);

  const sessionResults = session?.results;
  useEffect(() => {
    if (!sessionResults) return;
    for (const result of sessionResults) queueResult(result);
  }, [queueResult, sessionResults]);

  const timerRunning = Boolean(
    session &&
    !session.paused &&
    !session.exitConfirmationVisible &&
    !session.skipConfirmationVisible &&
    (session.phase === 'exercise' || session.phase === 'rest'),
  );

  useEffect(() => {
    if (!timerRunning) return undefined;

    const timer = setInterval(() => dispatch({ now: Date.now(), type: 'tick' }), 200);
    return () => clearInterval(timer);
  }, [dispatch, timerRunning]);

  const beginSession = useCallback(
    (routine: ExerciseRoutine, startedSession: StartedExerciseSession) => {
      const sessionId = getSessionId(startedSession.session);
      if (!sessionId) throw new Error('운동 세션 ID를 확인할 수 없어요.');
      const exercises = normalizeExercises(routine, startedSession);
      if (exercises.length === 0) throw new Error('수행할 운동이 없어요.');

      pendingWritesRef.current.clear();
      reportedResultsRef.current.clear();
      completedSessionRef.current = null;
      const now = Date.now();
      setSession({
        countSpeed: 'normal',
        currentExerciseIndex: 0,
        currentRep: 0,
        currentSet: 1,
        elapsedExerciseMs: 0,
        exercises,
        exitConfirmationVisible: false,
        guideEnabled: true,
        lastTickAt: now,
        paused: false,
        phase: 'exercise',
        repAccumulatorMs: 0,
        restRemainingMs: 0,
        restTotalMs: 0,
        results: [],
        sessionId,
        setRemainingMs: initialSetRemainingMs(exercises[0]),
        skipConfirmationVisible: false,
      });
    },
    [],
  );

  const clearSession = useCallback(() => {
    setSession(null);
    pendingWritesRef.current.clear();
    reportedResultsRef.current.clear();
    completedSessionRef.current = null;
  }, []);

  const completeSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new Error('진행 중인 운동 세션이 없어요.');
    if (completedSessionRef.current?.sessionId === current.sessionId) {
      return completedSessionRef.current.summary;
    }
    for (const result of current.results) queueResult(result);
    const pendingWrites = [...pendingWritesRef.current];
    if (pendingWrites.length > 0) await Promise.all(pendingWrites);
    await completeExerciseSession(current.sessionId);
    // The completed session remains valid if the independent tier service is unavailable.
    void awardTierActivity('recommended_workout_completed', current.sessionId).catch(() => undefined);
    const completedSummary = summarizeSession(current);
    completedSessionRef.current = { sessionId: current.sessionId, summary: completedSummary };
    return completedSummary;
  }, [queueResult]);

  const currentExercise = session
    ? (session.exercises[session.currentExerciseIndex] ?? null)
    : null;
  const summary = useMemo(() => summarizeSession(session), [session]);

  const value = useMemo<ExerciseSessionContextValue>(
    () => ({
      addRestSeconds: (seconds) =>
        dispatch({ milliseconds: Math.max(0, seconds) * 1000, type: 'add-rest' }),
      beginSession,
      clearSession,
      closeExitConfirmation: () => dispatch({ now: Date.now(), type: 'close-exit' }),
      closeSkipConfirmation: () => dispatch({ now: Date.now(), type: 'close-skip' }),
      completeCurrentSet: () => dispatch({ now: Date.now(), type: 'complete-set' }),
      completeSession,
      currentExercise,
      cycleCountSpeed: () => dispatch({ type: 'cycle-speed' }),
      goToNextExercise: () => dispatch({ now: Date.now(), type: 'next-exercise' }),
      openExitConfirmation: () => dispatch({ type: 'open-exit' }),
      openSkipConfirmation: () => dispatch({ type: 'open-skip' }),
      session,
      skipRest: () => dispatch({ now: Date.now(), type: 'finish-rest' }),
      skipCurrentExercise: () => dispatch({ now: Date.now(), type: 'skip-exercise' }),
      summary,
      toggleGuide: () => dispatch({ type: 'toggle-guide' }),
      togglePause: () => dispatch({ now: Date.now(), type: 'toggle-pause' }),
    }),
    [beginSession, clearSession, completeSession, currentExercise, dispatch, session, summary],
  );

  return (
    <ExerciseSessionContext.Provider value={value}>{children}</ExerciseSessionContext.Provider>
  );
}

export function useExerciseSession() {
  const context = useContext(ExerciseSessionContext);
  if (!context) throw new Error('useExerciseSession must be used within ExerciseSessionProvider');
  return context;
}
