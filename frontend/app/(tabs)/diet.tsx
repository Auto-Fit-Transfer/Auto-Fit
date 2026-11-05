import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MealRecordSheets, type MealRecordDraft } from '@/src/components/diet/MealRecordSheets';
import { R6DietHome } from '@/src/components/diet/R6DietHome';
import {
  getDietApiErrorMessage,
  getDietMealLogs,
  getDietNutritionSummary,
  getDietRecommendationsByDate,
  getWeeklyDiet,
  regenerateDietMeal,
  submitDietMealFeedback,
  updateDietMealFeedback,
  uploadDietMealPhoto,
  type DietActualItem,
  type DietFeedbackInput,
  type WeeklyPlan,
} from '@/src/api/diet';
import { ApiError } from '@/src/api/client';
import { awardTierActivity } from '@/src/api/tier';
import { weeklyDietErrorCode } from '@/src/features/diet/weeklyDietErrors';
import {
  isApiRecord,
  macroLabel,
  mapRecommendationMeals,
  mapWeeklyMeals,
  readArray,
  readMealType,
  readNumber,
  readString,
  type ApiRecord,
  type Meal,
  type MealStatus,
  type MealType,
} from '@/src/features/diet/dayMeals';
import { mergeDayMeals, weekStartOf } from '@/src/features/diet/weeklyMeals';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';

const dateWindowMin = -6;
const dateWindowMax = 6;

type MealStatuses = Record<MealType, MealStatus>;

type NutritionGoal = {
  targetKey: NutritionTargetKey;
  label: string;
  current: number | null;
  target: number | null;
  unit: string;
};

type NutritionTargetKey = 'calories' | 'carbohydrates' | 'fat' | 'protein';
type RecommendationNutritionTargets = Partial<Record<NutritionTargetKey, number>>;

const defaultMealStatuses: MealStatuses = {
  breakfast: 'recommended',
  lunch: 'recommended',
  dinner: 'recommended',
  snack: 'recommended',
};

// Values remain empty until the selected date's backend summary is loaded.
const nutritionGoals: NutritionGoal[] = [
  {
    targetKey: 'calories',
    label: '열량',
    current: null,
    target: null,
    unit: 'kcal',
  },
  {
    targetKey: 'carbohydrates',
    label: '탄수화물',
    current: null,
    target: null,
    unit: 'g',
  },
  {
    targetKey: 'protein',
    label: '단백질',
    current: null,
    target: null,
    unit: 'g',
  },
  {
    targetKey: 'fat',
    label: '지방',
    current: null,
    target: null,
    unit: 'g',
  },
];

function addDays(source: Date, amount: number) {
  const next = new Date(source);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + amount);
  return next;
}

function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function localClock(value: string | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function mapRecommendationNutritionTargets(result: unknown): RecommendationNutritionTargets {
  if (!isApiRecord(result) || !isApiRecord(result.recommendation)) return {};

  const recommendation = result.recommendation;
  return {
    calories: readNumber(recommendation, ['target_calories']),
    carbohydrates: readNumber(recommendation, ['target_carbohydrates']),
    fat: readNumber(recommendation, ['target_fat']),
    protein: readNumber(recommendation, ['target_protein']),
  };
}

function feedbackTypeToStatus(value: unknown): MealStatus | undefined {
  if (value === 'eaten') return 'eaten';
  if (value === 'different_food') return 'modified';
  if (value === 'skipped') return 'skipped';
  return undefined;
}

function mapLogDraft(log: ApiRecord, mealId: MealType): MealRecordDraft | undefined {
  const actualItems = readArray(log.actual_items ?? log.items);
  if (actualItems.length === 0) return undefined;

  const foods = actualItems.flatMap((item, index) => {
    if (!isApiRecord(item)) return [];
    const name = readString(item, ['food_name', 'name']);
    const amount = readNumber(item, ['quantity', 'amount']);
    const unit = readString(item, ['unit']);
    if (!name || amount === undefined || !unit) return [];
    return [
      {
        amount,
        carbs: readNumber(item, ['carbohydrates', 'carbs']),
        fat: readNumber(item, ['fat']),
        id: readString(item, ['meal_log_item_id', 'id']) ?? `server-food-${mealId}-${index}`,
        kcal: readNumber(item, ['calories', 'kcal']),
        name,
        protein: readNumber(item, ['protein']),
        serving: 1,
        unit,
      },
    ];
  });
  if (foods.length === 0) return undefined;

  const eatenAt = readString(log, ['eaten_at', 'created_at']);
  const kcal = foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0);
  return {
    foods,
    intake: foods.map((food) => [food.name, `${food.amount}${food.unit}`]),
    kcal,
    mealId,
    mealTime: eatenAt?.slice(11, 16) ?? '12:00',
    note: '',
    photoUri: readString(log, ['image_url']) ?? null,
    tags: [],
    usedIngredients: [],
  };
}

export default function DietScreen() {
  const router = useRouter();
  const [today] = useState(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return date;
  });
  const [selectedDateOffset, setSelectedDateOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(today));
  const [statusesByDate, setStatusesByDate] = useState<Record<string, Partial<MealStatuses>>>({});
  const [recordingMealId, setRecordingMealId] = useState<MealType | null>(null);
  const [recommendedMeals, setRecommendedMeals] = useState<Meal[]>([]);
  const [recommendationNutritionTargets, setRecommendationNutritionTargets] =
    useState<RecommendationNutritionTargets>({});
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [nutritionSummary, setNutritionSummary] = useState<NutritionSummary | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [feedbackMealIds, setFeedbackMealIds] = useState<Set<MealType>>(() => new Set());
  const [regeneratingMealIds, setRegeneratingMealIds] = useState<Set<MealType>>(() => new Set());
  const [mealRecordsByDate, setMealRecordsByDate] = useState<
    Record<string, Partial<Record<MealType, MealRecordDraft>>>
  >({});
  const [mealLogMetaByDate, setMealLogMetaByDate] = useState<
    Record<string, Partial<Record<MealType, { photoUrl?: string; time?: string }>>>
  >({});
  const feedbackRequestMealIdsRef = useRef(new Set<MealType>());
  const isMountedRef = useRef(true);
  const mealLogsRequestRef = useRef(0);
  const mealLogEntriesByDateRef = useRef(new Map<string, unknown[]>());
  const recommendationRequestRef = useRef(0);
  const recommendationMealsByDateRef = useRef<{ dateKey: string | null; meals: Meal[] }>({
    dateKey: null,
    meals: [],
  });
  const nutritionSummaryRequestRef = useRef(0);
  const regenerateRequestMealIdsRef = useRef(new Set<MealType>());
  const weeklyRequestRef = useRef(0);

  const displayedNutritionGoals = useMemo(
    () =>
      nutritionGoals.map((goal) => ({
        ...goal,
        current:
          nutritionSummary?.date === selectedDateKey
            ? nutritionNumber(nutritionSummary[goal.targetKey]?.consumed)
            : null,
        target:
          nutritionSummary?.date === selectedDateKey
            ? nutritionNumber(nutritionSummary[goal.targetKey]?.target)
            : (recommendationNutritionTargets[goal.targetKey] ?? null),
      })),
    [recommendationNutritionTargets, nutritionSummary, selectedDateKey],
  );
  const recommendationStatuses = useMemo(
    () =>
      recommendedMeals.reduce<MealStatuses>(
        (currentStatuses, meal) => ({
          ...currentStatuses,
          [meal.id]: meal.recommendationStatus ?? currentStatuses[meal.id],
        }),
        { ...defaultMealStatuses },
      ),
    [recommendedMeals],
  );
  const selectedStatuses = useMemo<MealStatuses>(
    () => ({
      ...recommendationStatuses,
      ...(statusesByDate[selectedDateKey] ?? {}),
    }),
    [recommendationStatuses, selectedDateKey, statusesByDate],
  );
  const todayDateKey = toDateKey(new Date());
  const feedbackEnabled = selectedDateKey === todayDateKey;
  const showRecordControls = selectedDateKey <= todayDateKey;
  const selectedWeek = weekStartOf(selectedDateKey);
  const shownMeals = useMemo(
    () => (recommendationLoading || recommendationError
      ? recommendedMeals
      : mergeDayMeals(recommendedMeals, mapWeeklyMeals(weeklyPlan, selectedDateKey))),
    [recommendationError, recommendationLoading, recommendedMeals, selectedDateKey, weeklyPlan],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const applyMealLogs = useCallback((dateKey: string, sourceMeals: Meal[], entries: unknown[]) => {
    const mealsByDietId = new Map(
      sourceMeals
        .filter((meal): meal is Meal & { dietMealId: string } => Boolean(meal.dietMealId))
        .map((meal) => [meal.dietMealId, meal]),
    );
    const nextStatuses: Partial<MealStatuses> = {};
    const nextRecords: Partial<Record<MealType, MealRecordDraft>> = {};
    const nextLogMeta: Partial<Record<MealType, { photoUrl?: string; time?: string }>> = {};

    entries.forEach((entry) => {
      if (!isApiRecord(entry)) return;
      const dietMealId = readString(entry, ['diet_meal_id', 'meal_id']);
      const targetMeal =
        (dietMealId ? mealsByDietId.get(dietMealId) : undefined) ??
        sourceMeals.find(
          (meal) =>
            meal.id ===
            readMealType(readString(entry, ['meal_type', 'meal_category', 'type', 'time_of_day'])),
        );
      const nextStatus = feedbackTypeToStatus(readString(entry, ['feedback_type', 'type']));
      if (!targetMeal || !nextStatus) return;

      nextStatuses[targetMeal.id] = nextStatus;
      nextLogMeta[targetMeal.id] = {
        photoUrl: readString(entry, ['image_url']),
        time: localClock(readString(entry, ['eaten_at', 'created_at'])),
      };
      if (nextStatus === 'modified') {
        const draft = mapLogDraft(entry, targetMeal.id);
        if (draft) nextRecords[targetMeal.id] = draft;
      }
    });

    setStatusesByDate((current) => ({ ...current, [dateKey]: nextStatuses }));
    setMealRecordsByDate((current) => ({ ...current, [dateKey]: nextRecords }));
    setMealLogMetaByDate((current) => ({ ...current, [dateKey]: nextLogMeta }));
  }, []);

  const loadMealLogs = useCallback(
    async (dateKey: string) => {
      const requestId = ++mealLogsRequestRef.current;
      try {
        const response = await getDietMealLogs(dateKey, dateKey);
        if (!isMountedRef.current || requestId !== mealLogsRequestRef.current) return;

        const entries = readArray(response.logs);
        mealLogEntriesByDateRef.current.set(dateKey, entries);

        const recommendationSnapshot = recommendationMealsByDateRef.current;
        if (recommendationSnapshot.dateKey === dateKey && recommendationSnapshot.meals.length > 0) {
          applyMealLogs(dateKey, recommendationSnapshot.meals, entries);
        }
      } catch (error) {
        if (!isMountedRef.current || requestId !== mealLogsRequestRef.current) return;
        Alert.alert('식사 기록을 불러오지 못했어요', getDietApiErrorMessage(error));
      }
    },
    [applyMealLogs],
  );

  const loadRecommendations = useCallback(
    async (dateKey: string) => {
      const requestId = ++recommendationRequestRef.current;
      recommendationMealsByDateRef.current = { dateKey, meals: [] };
      mealLogEntriesByDateRef.current.delete(dateKey);
      if (isMountedRef.current) {
        setRecommendationError(null);
        setRecommendationLoading(true);
        setRecommendedMeals([]);
        setRecommendationNutritionTargets({});
      }

      try {
        const response = await getDietRecommendationsByDate(dateKey);
        const mappedMeals = mapRecommendationMeals(response.result);
        const mappedNutritionTargets = mapRecommendationNutritionTargets(response.result);

        if (!isMountedRef.current || requestId !== recommendationRequestRef.current) return false;

        setRecommendedMeals(mappedMeals);
        setRecommendationNutritionTargets(mappedNutritionTargets);
        recommendationMealsByDateRef.current = { dateKey, meals: mappedMeals };
        const mealLogEntries = mealLogEntriesByDateRef.current.get(dateKey);
        if (mealLogEntries) applyMealLogs(dateKey, mappedMeals, mealLogEntries);
        return true;
      } catch (error) {
        if (!isMountedRef.current || requestId !== recommendationRequestRef.current) return false;
        const message = getDietApiErrorMessage(error);
        setRecommendationError(message);
        return false;
      } finally {
        if (isMountedRef.current && requestId === recommendationRequestRef.current) {
          setRecommendationLoading(false);
        }
      }
    },
    [applyMealLogs],
  );

  const loadNutritionSummary = useCallback(async (dateKey: string) => {
    const requestId = ++nutritionSummaryRequestRef.current;
    setNutritionError(null);
    try {
      const response = await getDietNutritionSummary(dateKey);
      if (!isMountedRef.current || requestId !== nutritionSummaryRequestRef.current) return;
      setNutritionSummary(response.summary);
    } catch (error) {
      if (!isMountedRef.current || requestId !== nutritionSummaryRequestRef.current) return;
      setNutritionSummary(null);
      setNutritionError(getDietApiErrorMessage(error));
    }
  }, []);

  const loadWeeklyPlan = useCallback(async (weekStart: string) => {
    const requestId = ++weeklyRequestRef.current;
    setWeeklyLoading(true);
    setWeeklyError(null);
    try {
      const plan = await getWeeklyDiet(weekStart);
      if (isMountedRef.current && requestId === weeklyRequestRef.current) setWeeklyPlan(plan);
    } catch (error) {
      if (!isMountedRef.current || requestId !== weeklyRequestRef.current) return;
      setWeeklyPlan(null);
      const noPlan = error instanceof ApiError && error.status === 404 && weeklyDietErrorCode(error.detail) === 'WEEKLY_DIET_NOT_FOUND';
      if (!noPlan) setWeeklyError(getDietApiErrorMessage(error));
    } finally {
      if (isMountedRef.current && requestId === weeklyRequestRef.current) setWeeklyLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadWeeklyPlan(selectedWeek);
  }, [loadWeeklyPlan, selectedWeek]));

  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      void loadRecommendations(selectedDateKey);
      void loadNutritionSummary(selectedDateKey);
      void loadMealLogs(selectedDateKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadMealLogs, loadNutritionSummary, loadRecommendations, selectedDateKey]));

  const openMealRecord = useCallback((mealId: MealType) => {
    setRecordingMealId(mealId);
  }, []);

  const saveDietMealFeedback = useCallback(
    async (dietMealId: string, input: DietFeedbackInput, hasExistingFeedback: boolean) => {
      const response = await (hasExistingFeedback
        ? updateDietMealFeedback(dietMealId, input)
        : submitDietMealFeedback(dietMealId, input));
      if (input.feedbackType !== 'skipped' && isApiRecord(response.result)) {
        const mealLog = isApiRecord(response.result.meal_log) ? response.result.meal_log : null;
        const mealLogId = mealLog ? readString(mealLog, ['meal_log_id', 'id']) : undefined;
        if (mealLogId) {
          // A point-service outage must not undo a meal that was already recorded.
          void awardTierActivity('meal_log', mealLogId).catch(() => undefined);
        }
      }
      return response;
    },
    [],
  );

  const submitFeedback = useCallback(
    async (mealId: MealType, status: Extract<MealStatus, 'eaten' | 'skipped'>) => {
      const meal = recommendedMeals.find((candidate) => candidate.id === mealId);
      const dietMealId = meal?.dietMealId;
      if (!dietMealId || feedbackRequestMealIdsRef.current.has(mealId)) {
        Alert.alert(
          '식사 상태를 저장할 수 없어요',
          '추천 식단 정보를 다시 불러온 뒤 시도해 주세요.',
        );
        return false;
      }

      const dateKey = selectedDateKey;
      const hasExistingFeedback = selectedStatuses[mealId] !== 'recommended';
      feedbackRequestMealIdsRef.current.add(mealId);
      setFeedbackMealIds((current) => new Set(current).add(mealId));
      try {
        await saveDietMealFeedback(
          dietMealId,
          {
            ...(status === 'eaten'
              ? {
                  ...(hasExistingFeedback ? { actualItems: [] } : {}),
                  eatenAt: new Date().toISOString(),
                }
              : hasExistingFeedback
                ? { actualItems: [], eatenAt: null }
                : {}),
            feedbackType: status,
          },
          hasExistingFeedback,
        );
        if (!isMountedRef.current) return false;

        setStatusesByDate((current) => ({
          ...current,
          [dateKey]: { ...(current[dateKey] ?? {}), [mealId]: status },
        }));
        setMealRecordsByDate((current) => {
          const dateRecords = current[dateKey];
          if (!dateRecords?.[mealId]) return current;

          const nextDateRecords = { ...dateRecords };
          delete nextDateRecords[mealId];
          return { ...current, [dateKey]: nextDateRecords };
        });
        void loadMealLogs(dateKey);
        void loadNutritionSummary(dateKey);
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert('식사 상태를 저장하지 못했어요', getDietApiErrorMessage(error));
        }
        return false;
      } finally {
        feedbackRequestMealIdsRef.current.delete(mealId);
        if (isMountedRef.current) {
          setFeedbackMealIds((current) => {
            const next = new Set(current);
            next.delete(mealId);
            return next;
          });
        }
      }
    },
    [
      loadMealLogs,
      loadNutritionSummary,
      recommendedMeals,
      saveDietMealFeedback,
      selectedDateKey,
      selectedStatuses,
    ],
  );

  const regenerateMeal = useCallback(
    async (mealId: MealType) => {
      const currentMeal = recommendedMeals.find((meal) => meal.id === mealId);
      const dietMealId = currentMeal?.dietMealId;
      if (!dietMealId || regenerateRequestMealIdsRef.current.has(mealId)) return;

      regenerateRequestMealIdsRef.current.add(mealId);
      setRegeneratingMealIds((current) => new Set(current).add(mealId));
      try {
        const response = await regenerateDietMeal(dietMealId);

        const rawRegeneratedMeal = response.meal;

        if (!isMountedRef.current) return;

        const mealForMapping =
          isApiRecord(rawRegeneratedMeal) && response.used_ingredients !== undefined
            ? { ...rawRegeneratedMeal, used_ingredients: response.used_ingredients }
            : rawRegeneratedMeal;
        const regeneratedMeal = mapRecommendationMeals({ meals: [mealForMapping] }).find(
          (meal) => meal.id === mealId,
        );
        if (regeneratedMeal) {
          setRecommendedMeals((current) => current.map((meal) => (meal.id === mealId ? regeneratedMeal : meal)));
          return;
        }

        // The regenerate response schema is free-form. Re-read the selected date using the
        // established recommendation mapper rather than constructing a meal client-side.
        await loadRecommendations(selectedDateKey);
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert('식단을 다시 추천하지 못했어요', getDietApiErrorMessage(error));
        }
      } finally {
        regenerateRequestMealIdsRef.current.delete(mealId);
        if (isMountedRef.current) {
          setRegeneratingMealIds((current) => {
            const next = new Set(current);
            next.delete(mealId);
            return next;
          });
        }
      }
    },
    [loadRecommendations, recommendedMeals, selectedDateKey],
  );

  const requestAlternativeMeal = useCallback(
    (mealId: MealType) => {
      if (recommendationLoading) return;
      Alert.alert('다른 식단을 추천받을까요?', '선택한 끼니만 새로운 식단으로 바꿔드려요.', [
        { style: 'cancel', text: '취소' },
        { onPress: () => void regenerateMeal(mealId), text: '새로 추천받기' },
      ]);
    },
    [regenerateMeal, recommendationLoading],
  );

  const completeMealRecord = useCallback(
    async (draft: MealRecordDraft) => {
      const mealId = draft.mealId as MealType;
      const meal = recommendedMeals.find((candidate) => candidate.id === mealId);
      const dietMealId = meal?.dietMealId;
      const actualItems: DietActualItem[] = draft.foods.map((food) => ({
        calories: food.kcal ?? null,
        carbohydrates: food.carbs ?? null,
        fat: food.fat ?? null,
        food_name: food.name.trim(),
        protein: food.protein ?? null,
        quantity: food.amount,
        unit: food.unit.trim(),
      }));

      if (
        !dietMealId ||
        feedbackRequestMealIdsRef.current.has(mealId) ||
        actualItems.length < 1 ||
        actualItems.length > 20 ||
        actualItems.some(
          (item) =>
            !item.food_name ||
            !item.unit ||
            (typeof item.quantity === 'number' && item.quantity <= 0),
        )
      ) {
        Alert.alert('식사 기록을 저장할 수 없어요', '음식명, 수량, 단위를 확인해 주세요.');
        return false;
      }

      const dateKey = selectedDateKey;
      const hasExistingFeedback = selectedStatuses[mealId] !== 'recommended';
      let feedbackSaved = false;
      feedbackRequestMealIdsRef.current.add(mealId);
      setFeedbackMealIds((current) => new Set(current).add(mealId));
      try {
        const feedbackResponse = await saveDietMealFeedback(
          dietMealId,
          {
            actualItems,
            eatenAt: new Date().toISOString(),
            feedbackType: 'different_food',
          },
          hasExistingFeedback,
        );
        feedbackSaved = true;

        if (draft.photoUri) {
          const result = isApiRecord(feedbackResponse.result)
            ? feedbackResponse.result
            : undefined;
          const mealLog = result && isApiRecord(result.meal_log) ? result.meal_log : undefined;
          const mealLogId = mealLog ? readString(mealLog, ['meal_log_id', 'id']) : undefined;

          if (!mealLogId) {
            throw new Error('식사는 기록됐지만 사진을 연결할 식사 기록을 찾지 못했어요.');
          }

          try {
            await uploadDietMealPhoto(mealLogId, {
              fileName: draft.photoFileName,
              mimeType: draft.photoMimeType,
              uri: draft.photoUri,
            });
          } catch (error) {
            // A lost success response can be retried and return 409 because the same meal log
            // already owns the uploaded photo. In that case the desired state is complete.
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
          }
        }
        if (!isMountedRef.current) return false;

        setMealRecordsByDate((current) => ({
          ...current,
          [dateKey]: {
            ...(current[dateKey] ?? {}),
            [mealId]: draft,
          },
        }));
        setStatusesByDate((current) => ({
          ...current,
          [dateKey]: { ...(current[dateKey] ?? {}), [mealId]: 'modified' },
        }));
        setRecordingMealId(null);
        void loadMealLogs(dateKey);
        void loadNutritionSummary(dateKey);
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert(
            feedbackSaved ? '식사는 기록했지만 사진을 저장하지 못했어요' : '식사 기록을 저장하지 못했어요',
            feedbackSaved
              ? `${getDietApiErrorMessage(error)}\n사진 저장을 다시 시도해 주세요.`
              : getDietApiErrorMessage(error),
          );
        }
        return false;
      } finally {
        feedbackRequestMealIdsRef.current.delete(mealId);
        if (isMountedRef.current) {
          setFeedbackMealIds((current) => {
            const next = new Set(current);
            next.delete(mealId);
            return next;
          });
        }
      }
    },
    [
      loadMealLogs,
      loadNutritionSummary,
      recommendedMeals,
      saveDietMealFeedback,
      selectedDateKey,
      selectedStatuses,
    ],
  );

  const moveSelectedDate = (amount: number) => {
    const nextOffset = Math.max(
      dateWindowMin,
      Math.min(dateWindowMax, selectedDateOffset + amount),
    );
    if (nextOffset === selectedDateOffset) return;

    const nextDateKey = toDateKey(addDays(today, nextOffset));
    recommendationMealsByDateRef.current = { dateKey: nextDateKey, meals: [] };
    setRecommendedMeals([]);
    setRecommendationError(null);
    setRecommendationLoading(true);
    setSelectedDateOffset(nextOffset);
    setSelectedDateKey(nextDateKey);
  };

  return (
    <View style={{ flex: 1 }}>
      <R6DietHome
        today={today}
        selectedDateOffset={selectedDateOffset}
        selectedDateKey={selectedDateKey}
        goals={displayedNutritionGoals.map(({ label, current, target, unit }) => ({ label, current, target, unit }))}
        nutritionError={nutritionError}
        hasUnknownItems={nutritionSummary?.date === selectedDateKey && Boolean(nutritionSummary.has_unknown_items)}
        meals={shownMeals.map((meal) => {
          const record = mealRecordsByDate[selectedDateKey]?.[meal.id];
          const log = mealLogMetaByDate[selectedDateKey]?.[meal.id];
          const recordedFoods = record?.foods;
          const status = selectedStatuses[meal.id];
          const photoUrl = record?.photoUri ?? log?.photoUrl;
          const macros = status === 'modified' && recordedFoods ? macroLabel(recordedFoods) : meal.macros;
          const recordedKcal = recordedFoods?.every((food) => food.kcal !== undefined)
            ? recordedFoods.reduce((sum, food) => sum + (food.kcal ?? 0), 0)
            : null;
          return {
            id: meal.id,
            title: meal.title,
            kcal: status === 'modified' && recordedFoods ? recordedKcal : meal.kcal,
            foods: recordedFoods?.map((food) => food.name).join(' · ') || meal.foods,
            note: meal.note || meal.description || '',
            detail: status === 'eaten' || status === 'modified'
              ? [[log?.time, photoUrl ? '사진으로 기록' : '기록'].filter(Boolean).join(' '), macros].filter(Boolean).join(' · ')
              : null,
            photoUrl: photoUrl ?? undefined,
            status,
            canSave: feedbackEnabled && Boolean(meal.dietMealId),
            pending: feedbackMealIds.has(meal.id),
            regenerating: regeneratingMealIds.has(meal.id),
          };
        })}
        mealsLoading={recommendationLoading || (recommendedMeals.length === 0 && weeklyLoading)}
        mealsError={recommendationError ?? (!recommendationLoading && recommendedMeals.length === 0 ? weeklyError : null)}
        onSelectDateOffset={(offset) => moveSelectedDate(offset - selectedDateOffset)}
        onRetryNutrition={() => void loadNutritionSummary(selectedDateKey)}
        onRetryMeals={() => {
          void loadRecommendations(selectedDateKey);
          void loadWeeklyPlan(selectedWeek);
        }}
        onRecord={openMealRecord}
        onStatusChange={(mealId, status) => void submitFeedback(mealId, status)}
        onAlternative={requestAlternativeMeal}
        onOpenRecipe={(mealId) => {
          const meal = shownMeals.find((item) => item.id === mealId);
          if (meal?.weekly) {
            router.push({ pathname: '/diet/weekly-recipe', params: { planId: meal.weekly.planId, day: meal.weekly.day, mealType: meal.id } });
          } else if (meal?.dietMealId) {
            router.push({ pathname: '/diet/recipe', params: { date: selectedDateKey, mealId: meal.dietMealId } });
          }
        }}
        onOpenProteinGuide={() => router.push({ pathname: '/diet/protein-guide', params: { date: selectedDateKey } })}
        onOpenWeekly={() => router.push('/diet/weekly')}
        showRecordControls={showRecordControls}
      />
      <MealRecordSheets
        initialDraft={recordingMealId ? mealRecordsByDate[selectedDateKey]?.[recordingMealId] : undefined}
        mealId={recordingMealId}
        onClose={() => setRecordingMealId(null)}
        onComplete={completeMealRecord}
        visible={recordingMealId !== null}
      />
    </View>
  );
}
