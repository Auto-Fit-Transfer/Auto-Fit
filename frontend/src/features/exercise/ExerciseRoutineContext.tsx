import { mapWeeklyMetrics, sessionMinutes, sessionLocalDate } from './weeklyMetrics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  generateExerciseRecommendation,
  getExerciseProgress,
  getExercisePreferences,
  getExerciseSummary,
  getExerciseSessionFeedback,
  getLatestExerciseRecommendation,
  getLatestExerciseSession,
  getExerciseApiErrorMessage,
  saveExerciseRecommendationContext,
  startExerciseSession,
  type ExerciseApiEquipment,
} from '@/src/api/exercise';
import { ApiError } from '@/src/api/client';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  initialExerciseCondition,
  type ExerciseCondition,
  type ExerciseDayStatus,
  type ExerciseItem,
  type ExerciseRoutine,
} from './exerciseData';

type ApiRecord = Record<string, unknown>;
type ExerciseLoadState = 'empty' | 'error' | 'loading' | 'ready';

export type ExerciseSessionSummary = {
  calories: number | null;
  completed: boolean;
  date: string | null;
  durationMinutes: number | null;
  itemCount: number | null;
  sessionId: string | null;
};

export type ExerciseHomeMetrics = {
  currentWorkoutStreakDays: number | null;
  currentWeekWorkoutCount: number | null;
  targetWorkoutCount: number | null;
  goalAchievementRate: number | null;
  remainingGoalWorkoutCount: number | null;
};

export type StartedExerciseSession = {
  items: unknown[];
  session: ApiRecord;
};

interface ExerciseRoutineContextValue {
  activeSession: StartedExerciseSession | null;
  condition: ExerciseCondition;
  generateRoutine: (condition: ExerciseCondition) => Promise<void>;
  homeError: string | null;
  homeLoadState: ExerciseLoadState;
  homeMetrics: ExerciseHomeMetrics;
  latestSession: ExerciseSessionSummary | null;
  markResultRecordCompleted: () => void;
  markRoutineCompleted: (summary: Omit<ExerciseSessionSummary, 'completed' | 'date'>) => void;
  refreshHome: () => Promise<void>;
  resultRecordCompleted: boolean;
  routine: ExerciseRoutine | null;
  setCondition: (condition: ExerciseCondition) => void;
  startRoutine: () => Promise<StartedExerciseSession>;
  status: ExerciseDayStatus | null;
}

const ExerciseRoutineContext = createContext<ExerciseRoutineContextValue | null>(null);

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(record: ApiRecord, key: string) {
  const value = record[key];
  return isRecord(value) ? value : null;
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

function readStringArray(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === 'string' && Boolean(item.trim()),
      );
    }
  }
  return [];
}

function getResult(response: unknown) {
  if (!isRecord(response)) return null;
  return readRecord(response, 'result');
}

function getResultValue(response: unknown) {
  return isRecord(response) ? response.result : undefined;
}

function formatPrescription(
  item: Pick<
    ExerciseItem,
    | 'durationMinutes'
    | 'executionType'
    | 'repetitions'
    | 'restSeconds'
    | 'sets'
    | 'targetDurationSeconds'
    | 'targetWeightKg'
  >,
) {
  const parts: string[] = [];
  if (item.executionType === 'time_based') {
    if (item.durationMinutes !== null) parts.push(`${item.durationMinutes}분`);
    if (item.targetDurationSeconds !== null) parts.push(`목표 ${item.targetDurationSeconds}초`);
  } else {
    if (item.repetitions !== null) parts.push(`${item.repetitions}회`);
    if (item.sets !== null) parts.push(`${item.sets}세트`);
    if (item.targetWeightKg !== null) parts.push(`${item.targetWeightKg}kg`);
    if (item.durationMinutes !== null) parts.push(`${item.durationMinutes}분`);
  }
  if (item.restSeconds !== null) parts.push(`휴식 ${item.restSeconds}초`);
  return parts.join(' · ');
}

function mapExerciseItems(result: ApiRecord): ExerciseItem[] {
  const items = Array.isArray(result.items) ? result.items : [];

  return items
    .flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item, ['exercise_item_id']);
      const name = readString(item, ['exercise_name']);
      if (!id || !name) return [];
      const mappedItem: ExerciseItem = {
        caloriesBurned: readNumber(item, ['calories_burned']),
        demoVideoUrl: readString(item, ['demo_video_url']),
        durationMinutes: readNumber(item, ['duration_minutes']),
        executionType: readString(item, ['execution_type']),
        id,
        instruction: readString(item, ['instruction']),
        intensity: readString(item, ['intensity']),
        name,
        prescription: '',
        recommendationId: readString(item, ['exercise_recommendation_id']),
        repetitions: readNumber(item, ['repetitions']),
        restSeconds: readNumber(item, ['rest_seconds']),
        sequenceOrder: readNumber(item, ['sequence_order']),
        sets: readNumber(item, ['sets']),
        targetDurationSeconds: readNumber(item, ['target_duration_seconds']),
        targetWeightKg: readNumber(item, ['target_weight_kg']),
        thumbnailUrl: readString(item, ['thumbnail_url']),
      };
      return [{ ...mappedItem, prescription: formatPrescription(mappedItem) }];
    })
    .sort((left, right) => {
      if (left.sequenceOrder === null) return 1;
      if (right.sequenceOrder === null) return -1;
      return left.sequenceOrder - right.sequenceOrder;
    });
}

function mapExerciseRoutine(response: unknown): ExerciseRoutine | null {
  const result = getResult(response);
  if (!result) return null;
  const recommendation = readRecord(result, 'recommendation') ?? result;
  const title = readString(recommendation, [
    'recommendation_summary',
    'title',
    'name',
    'recommendation_title',
  ]);
  if (!title) return null;
  const aiReason = readString(recommendation, ['ai_reason']);

  return {
    estimatedCalories: readNumber(recommendation, [
      'estimated_calories',
      'estimated_kcal',
      'calories',
    ]),
    exercises: mapExerciseItems(result),
    id: readString(recommendation, ['exercise_recommendation_id', 'recommendation_id', 'id']),
    intensity: readString(recommendation, ['intensity', 'intensity_level']) ?? '',
    reasons: aiReason ? [aiReason] : readStringArray(recommendation, ['reasons', 'reason_list']),
    subtitle: readString(recommendation, ['subtitle', 'sub_title']) ?? '',
    totalDurationMinutes: readNumber(recommendation, ['total_duration_minutes']),
    title,
  };
}

function mapExerciseSession(response: unknown): ExerciseSessionSummary | null {
  const result = getResult(response);
  if (!result) return null;
  const session = readRecord(result, 'session') ?? result;
  const status = readString(session, ['status']);
  const completedAt = readString(session, ['completed_at']);

  return {
    calories: readNumber(session, [
      'total_calories_burned',
      'calories',
      'total_calories',
      'calories_burned',
    ]),
    completed: session.completed === true || status === 'completed' || completedAt !== null,
    date:
      completedAt ??
      readString(session, ['session_date', 'exercise_date', 'started_at', 'created_at']),
    durationMinutes:
      readNumber(session, ['duration_minutes', 'total_duration_minutes']) ??
      sessionMinutes(session.total_duration_seconds),
    itemCount: readNumber(session, ['item_count', 'completed_item_count']),
    sessionId: readString(session, ['exercise_session_id', 'session_id', 'id']),
  };
}

function hasExerciseSessionFeedback(response: unknown) {
  return isRecord(response) && response.feedback !== null && response.feedback !== undefined;
}

function mapStartedExerciseSession(response: unknown): StartedExerciseSession | null {
  const result = getResult(response);
  if (!result) return null;
  const session = readRecord(result, 'session');
  if (!session) return null;
  return { items: Array.isArray(result.items) ? result.items : [], session };
}

function toDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const local = sessionLocalDate(value);
  return local === '날짜 미기록' ? null : local;
}

function getTodayDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mapEquipment(equipment: ExerciseCondition['equipment']): ExerciseApiEquipment[] {
  return equipment.map((item) => (item === 'bodyweight' ? 'mat' : item));
}

function isMissingExerciseData(result: PromiseSettledResult<unknown>) {
  return (
    result.status === 'rejected' &&
    result.reason instanceof ApiError &&
    result.reason.status === 404
  );
}

export function ExerciseRoutineProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<StartedExerciseSession | null>(null);
  const [condition, setCondition] = useState(initialExerciseCondition);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeLoadState, setHomeLoadState] = useState<ExerciseLoadState>('loading');
  const [homeMetrics, setHomeMetrics] = useState<ExerciseHomeMetrics>({
    currentWorkoutStreakDays: null,
    currentWeekWorkoutCount: null,
    targetWorkoutCount: null,
    goalAchievementRate: null,
    remainingGoalWorkoutCount: null,
  });
  const [latestSession, setLatestSession] = useState<ExerciseSessionSummary | null>(null);
  const [resultRecordCompleted, setResultRecordCompleted] = useState(false);
  const [routine, setRoutine] = useState<ExerciseRoutine | null>(null);
  const [status, setStatus] = useState<ExerciseDayStatus | null>(null);
  const homeRequestInFlight = useRef(false);
  const homeRequestId = useRef(0);
  const routineRequestInFlight = useRef(false);
  const sessionRequestInFlight = useRef(false);
  const mountedRef = useRef(true);
  const authenticatedUserIdRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const resetForAuthenticatedUser = (userId: string | null) => {
      if (authenticatedUserIdRef.current === userId) return;

      authenticatedUserIdRef.current = userId;
      homeRequestId.current += 1;
      homeRequestInFlight.current = false;
      setActiveSession(null);
      setCondition(initialExerciseCondition);
      setHomeError(null);
      setHomeLoadState('loading');
      setHomeMetrics({
        currentWorkoutStreakDays: null,
        currentWeekWorkoutCount: null,
        targetWorkoutCount: null,
        goalAchievementRate: null,
        remainingGoalWorkoutCount: null,
      });
      setLatestSession(null);
      setResultRecordCompleted(false);
      setRoutine(null);
      setStatus(null);
    };

    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (mountedRef.current) resetForAuthenticatedUser(session?.user.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mountedRef.current) resetForAuthenticatedUser(session?.user.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshHome = useCallback(async () => {
    if (homeRequestInFlight.current) return;
    homeRequestInFlight.current = true;
    const requestId = ++homeRequestId.current;
    setHomeError(null);
    setHomeLoadState('loading');

    const [recommendationResult, sessionResult, , progressResult] = await Promise.allSettled([
      getLatestExerciseRecommendation(),
      getLatestExerciseSession(),
      getExerciseSummary(),
      getExerciseProgress(),
    ]);

    if (homeRequestId.current === requestId) homeRequestInFlight.current = false;
    if (!mountedRef.current || homeRequestId.current !== requestId) return;

    const recommendationMissing = isMissingExerciseData(recommendationResult);
    const sessionMissing = isMissingExerciseData(sessionResult);
    if (
      (recommendationResult.status === 'rejected' && !recommendationMissing) ||
      (sessionResult.status === 'rejected' && !sessionMissing)
    ) {
      const failedResult = [recommendationResult, sessionResult].find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      const error = failedResult?.reason;
      console.error('Exercise home request failed:', error);
      setHomeError(getExerciseApiErrorMessage(error));
      setHomeLoadState('error');
      return;
    }

    const recommendationResponse =
      recommendationResult.status === 'fulfilled' ? recommendationResult.value : { result: null };
    const recommendationResultValue = getResultValue(recommendationResponse);
    const nextRoutine = mapExerciseRoutine(recommendationResponse);
    const recommendationRecord = getResult(recommendationResponse);
    const recommendationMetadata = recommendationRecord
      ? (readRecord(recommendationRecord, 'recommendation') ?? recommendationRecord)
      : null;
    const recommendationDateValue = recommendationMetadata
      ? readString(recommendationMetadata, [
          'recommendation_date',
          'recommended_for',
          'generated_at',
          'created_at',
        ])
      : null;
    const nextSession = mapExerciseSession(
      sessionResult.status === 'fulfilled' ? sessionResult.value : { result: null },
    );
    const nextHomeMetrics = mapWeeklyMetrics(
      progressResult.status === 'fulfilled' ? progressResult.value : null,
    );

    const todayDateKey = getTodayDateKey();
    const sessionDate = nextSession?.date ? toDateKey(nextSession.date) : null;
    const hasCompletedSessionToday =
      nextSession?.completed === true && sessionDate === todayDateKey;
    let nextResultRecordCompleted = false;

    if (hasCompletedSessionToday && nextSession?.sessionId) {
      try {
        const feedbackResponse = await getExerciseSessionFeedback(nextSession.sessionId);
        if (!mountedRef.current || homeRequestId.current !== requestId) return;
        nextResultRecordCompleted = hasExerciseSessionFeedback(feedbackResponse);
      } catch (error) {
        if (!mountedRef.current || homeRequestId.current !== requestId) return;
        console.error('Exercise feedback restore failed:', error);
        setHomeError(getExerciseApiErrorMessage(error));
        setHomeLoadState('error');
        return;
      }
    }

    setLatestSession(nextSession);
    setHomeMetrics(nextHomeMetrics);

    // 오늘 완료 세션은 추천 조회 결과와 관계없이 Home Hero에서 최우선입니다.
    if (hasCompletedSessionToday) {
      setRoutine(nextRoutine);
      setResultRecordCompleted(nextResultRecordCompleted);
      setStatus('completed');
      setHomeLoadState('ready');
      return;
    }

    if (recommendationResultValue === null) {
      setRoutine(null);
      setActiveSession(null);
      setStatus('not-created');
      setHomeLoadState('ready');
      return;
    }

    const recommendationDate =
      nextRoutine && recommendationDateValue ? toDateKey(recommendationDateValue) : null;
    if (!nextRoutine || !recommendationDate) {
      setRoutine(null);
      setStatus('not-created');
      setHomeError('오늘의 운동 추천 정보를 표시할 수 없어요.');
      setHomeLoadState('empty');
      return;
    }

    setRoutine(nextRoutine);
    if (recommendationDate !== todayDateKey) {
      setStatus('not-created');
      setHomeLoadState('ready');
      return;
    }

    setStatus('ready');
    setHomeLoadState('ready');
  }, []);

  const generateRoutine = useCallback(async (nextCondition: ExerciseCondition) => {
    if (routineRequestInFlight.current) return;
    routineRequestInFlight.current = true;

    try {
      const availableMinutes = nextCondition.availableMinutes;
      const location = nextCondition.location;
      const conditionLevel = nextCondition.condition.trim();
      if (availableMinutes === null || location === null || !conditionLevel) {
        throw new Error('운동 조건을 모두 입력해 주세요.');
      }

      const preferencesResponse = await getExercisePreferences();
      if (isRecord(preferencesResponse) && preferencesResponse.preferences === null) {
        throw new Error('운동 목표와 경험을 먼저 설정해 주세요.');
      }

      await saveExerciseRecommendationContext({
        availableEquipment: mapEquipment(nextCondition.equipment),
        availableMinutes,
        conditionLevel,
        conditionNote: null,
        discomfortAreas: nextCondition.discomfortArea.trim()
          ? [nextCondition.discomfortArea.trim()]
          : [],
        location,
      });
      const generatedResponse = await generateExerciseRecommendation();
      const generatedRoutine = mapExerciseRoutine(generatedResponse);
      if (!generatedRoutine) {
        throw new Error('생성된 운동 추천 정보를 표시할 수 없어요.');
      }

      if (!mountedRef.current) return;
      setCondition(nextCondition);
      setRoutine(generatedRoutine);
      setStatus('ready');
      setLatestSession(null);
      setResultRecordCompleted(false);
      setActiveSession(null);
      setHomeError(null);
      setHomeLoadState('ready');
    } finally {
      routineRequestInFlight.current = false;
    }
  }, []);

  const startRoutine = useCallback(async () => {
    if (status !== 'ready' || !routine) throw new Error('오늘의 새 운동 추천을 먼저 받아주세요.');
    if (sessionRequestInFlight.current) {
      throw new Error('운동 세션을 시작하고 있어요.');
    }
    sessionRequestInFlight.current = true;

    try {
      const response = await startExerciseSession();
      const startedSession = mapStartedExerciseSession(response);
      const nextSession = mapExerciseSession(response);
      if (!startedSession || !nextSession) {
        throw new Error('운동 세션 정보를 확인할 수 없어요.');
      }
      if (!mountedRef.current) return startedSession;
      setActiveSession(startedSession);
      setLatestSession(nextSession);
      setResultRecordCompleted(false);
      return startedSession;
    } finally {
      sessionRequestInFlight.current = false;
    }
  }, [status, routine]);

  const markRoutineCompleted = useCallback(
    (summary: Omit<ExerciseSessionSummary, 'completed' | 'date'>) => {
      setLatestSession({
        ...summary,
        completed: true,
        date: new Date().toISOString(),
      });
      setResultRecordCompleted(false);
      setStatus('completed');
    },
    [],
  );

  const markResultRecordCompleted = useCallback(() => {
    setResultRecordCompleted(true);
  }, []);

  const value = useMemo(
    () => ({
      activeSession,
      condition,
      generateRoutine,
      homeError,
      homeLoadState,
      homeMetrics,
      latestSession,
      markResultRecordCompleted,
      markRoutineCompleted,
      refreshHome,
      resultRecordCompleted,
      routine,
      setCondition,
      startRoutine,
      status,
    }),
    [
      activeSession,
      condition,
      generateRoutine,
      homeError,
      homeLoadState,
      homeMetrics,
      latestSession,
      markResultRecordCompleted,
      markRoutineCompleted,
      refreshHome,
      resultRecordCompleted,
      routine,
      startRoutine,
      status,
    ],
  );

  return (
    <ExerciseRoutineContext.Provider value={value}>{children}</ExerciseRoutineContext.Provider>
  );
}

export function useExerciseRoutine() {
  const context = useContext(ExerciseRoutineContext);
  if (!context) throw new Error('useExerciseRoutine must be used within ExerciseRoutineProvider');
  return context;
}
