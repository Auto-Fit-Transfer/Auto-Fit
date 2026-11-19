import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MealRecordSheets, type MealRecordDraft } from '@/src/components/diet/MealRecordSheets';
import { DietView } from '@/src/components/a/DietView';
import { MenuStyleSheet } from '@/src/components/a/MenuStyleSheet';
import { TomorrowSheet, type TomorrowPlan, type TomorrowSheetProps } from '@/src/components/a/TomorrowSheet';
import {
  confirmRebalance,
  getDietApiErrorMessage,
  getDietMealLogs,
  getDietNutritionSummary,
  getDietPreferences,
  getDietWeeklySummary,
  getRebalanceStatus,
  getWeeklyDiet,
  getWeeklyDietFeedback,
  previewRebalance,
  regenerateWeeklyDietMeal,
  saveDietPreferences,
  saveRebalanceCheat,
  saveWeeklyDietFeedback,
  uploadDietMealPhoto,
  type DietActualItem,
  type MenuStylePreference,
  type RebalanceStatus,
  type WeeklyFeedbackRecord,
  type WeeklyFeedbackType,
  type WeeklyPlan,
} from '@/src/api/diet';
import { ApiError } from '@/src/api/client';
import { awardTierActivity } from '@/src/api/tier';
import { mealAllergyNotice } from '@/src/features/diet/allergyConflict';
import { useAllergyNames } from '@/src/features/diet/useAllergyNames';
import { menuStyleFailure } from '@/src/features/diet/menuStyle';
import { weeklyDietErrorCode } from '@/src/features/diet/weeklyDietErrors';
import {
  isApiRecord,
  macroLabel,
  mapWeeklyMeals,
  mealPresentation,
  readArray,
  readMealType,
  readNumber,
  readString,
  type ApiRecord,
  type Meal,
  type MealStatus,
  type MealType,
} from '@/src/features/diet/dayMeals';
import { loadWeekCalories, type DayCalories } from '@/src/features/diet/weekCalories';
import { weekStartOf, weeklyDayFor } from '@/src/features/diet/weeklyMeals';
import { previewPlan, weeklyStatuses } from '@/src/features/diet/weeklyRecords';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';

// Renewal A's diet tab. Since 11/19 (user + 현호, back-end 01a28952) the day shown is the week's AI plan, not the
// daily recommendation: 일반식/건강식 and 내일 맞추기 change that one plan, and meals are recorded against it.
const dateWindowMin = -6;
const dateWindowMax = 6;

type MealStatuses = Record<MealType, MealStatus>;
type NutritionTargetKey = 'calories' | 'carbohydrates' | 'fat' | 'protein';

const defaultMealStatuses: MealStatuses = {
  breakfast: 'recommended',
  lunch: 'recommended',
  dinner: 'recommended',
  snack: 'recommended',
};

const nutritionGoals: { targetKey: NutritionTargetKey; label: string; unit: string }[] = [
  { targetKey: 'calories', label: '열량', unit: 'kcal' },
  { targetKey: 'carbohydrates', label: '탄수화물', unit: 'g' },
  { targetKey: 'protein', label: '단백질', unit: 'g' },
  { targetKey: 'fat', label: '지방', unit: 'g' },
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

const errorCode = (error: unknown) => (error instanceof ApiError ? weeklyDietErrorCode(error.detail) : null);
const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

function rebalanceError(error: unknown) {
  const code = errorCode(error);
  if (code === 'DIET_DAILY_FLOOR_REACHED') return '내일 식단이 이미 가벼워서 더 줄일 수 없어요.';
  if (code === 'DIET_TARGET_UNAVAILABLE') return '아직 하루 목표가 없어서 내일 식단을 맞출 수 없어요.';
  if (isConflict(error)) return '오늘 기록이나 식단이 바뀌었어요. 다시 맞춰 주세요.';
  return menuStyleFailure(error instanceof ApiError ? error.status : undefined) ?? getDietApiErrorMessage(error);
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
  const [logStatusesByDate, setLogStatusesByDate] = useState<Record<string, Partial<MealStatuses>>>({});
  const [recordingMealId, setRecordingMealId] = useState<MealType | null>(null);
  const [nutritionSummary, setNutritionSummary] = useState<NutritionSummary | null>(null);
  const [weekCalories, setWeekCalories] = useState<DayCalories[] | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ planId: string; list: WeeklyFeedbackRecord[]; legacy: WeeklyFeedbackRecord[] } | null>(null);
  const [feedbackMealIds, setFeedbackMealIds] = useState<Set<MealType>>(() => new Set());
  const [regeneratingMealIds, setRegeneratingMealIds] = useState<Set<MealType>>(() => new Set());
  const [mealRecordsByDate, setMealRecordsByDate] = useState<
    Record<string, Partial<Record<MealType, MealRecordDraft>>>
  >({});
  const [mealLogMetaByDate, setMealLogMetaByDate] = useState<
    Record<string, Partial<Record<MealType, { photoUrl?: string; time?: string }>>>
  >({});
  // 일반식 / 건강식: undefined until the server answers (an older server hides the button)
  const [menuStyle, setMenuStyle] = useState<MenuStylePreference | undefined>(undefined);
  const [styleSheet, setStyleSheet] = useState<{ open: boolean; saving: boolean; error: string }>({ open: false, saving: false, error: '' });
  // 내일 맞추기
  const [rebalance, setRebalance] = useState<RebalanceStatus | null>(null);
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [tomorrowState, setTomorrowState] = useState<TomorrowSheetProps['state']>('choose');
  const [tomorrowPlanPreview, setTomorrowPlanPreview] = useState<TomorrowPlan | null>(null);
  const [tomorrowError, setTomorrowError] = useState('');
  const [tomorrowWeek, setTomorrowWeek] = useState<WeeklyPlan | null>(null);
  const pickedRef = useRef<MealType[]>([]);
  const previewIdRef = useRef<string | null>(null);
  const feedbackRequestMealIdsRef = useRef(new Set<MealType>());
  const regenerateRequestMealIdsRef = useRef(new Set<MealType>());
  const isMountedRef = useRef(true);
  const mealLogsRequestRef = useRef(0);
  const nutritionSummaryRequestRef = useRef(0);
  const weeklyRequestRef = useRef(0);

  const todayDateKey = toDateKey(new Date());
  const feedbackEnabled = selectedDateKey === todayDateKey;
  const showRecordControls = selectedDateKey <= todayDateKey;
  const selectedWeek = weekStartOf(selectedDateKey);
  const allergyNames = useAllergyNames();
  const shownMeals = useMemo(() => mapWeeklyMeals(weeklyPlan, selectedDateKey), [selectedDateKey, weeklyPlan]);
  const selectedDay = weeklyDayFor(weeklyPlan, selectedDateKey)?.day ?? null;
  const weekly = useMemo(
    () => weeklyStatuses(selectedDay, feedback && weeklyPlan && feedback.planId === weeklyPlan.weekly_diet_plan_id ? feedback.list : [],
      feedback && weeklyPlan && feedback.planId === weeklyPlan.weekly_diet_plan_id ? feedback.legacy : []),
    [feedback, selectedDay, weeklyPlan],
  );
  const selectedStatuses = useMemo<MealStatuses>(
    () => ({ ...defaultMealStatuses, ...(logStatusesByDate[selectedDateKey] ?? {}), ...weekly.statuses }),
    [logStatusesByDate, selectedDateKey, weekly.statuses],
  );
  const displayedNutritionGoals = nutritionGoals.map((goal) => ({
    label: goal.label,
    unit: goal.unit,
    current: nutritionSummary?.date === selectedDateKey ? nutritionNumber(nutritionSummary[goal.targetKey]?.consumed) : null,
    target: nutritionSummary?.date === selectedDateKey ? nutritionNumber(nutritionSummary[goal.targetKey]?.target) : null,
  }));

  useFocusEffect(useCallback(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []));

  // photos, times and different foods come from the meal logs; whether a meal is recorded comes from the plan's feedback
  const loadMealLogs = useCallback(async (dateKey: string) => {
    const requestId = ++mealLogsRequestRef.current;
    try {
      const response = await getDietMealLogs(dateKey, dateKey);
      if (!isMountedRef.current || requestId !== mealLogsRequestRef.current) return;
      const statuses: Partial<MealStatuses> = {};
      const records: Partial<Record<MealType, MealRecordDraft>> = {};
      const meta: Partial<Record<MealType, { photoUrl?: string; time?: string }>> = {};
      readArray(response.logs).forEach((entry) => {
        if (!isApiRecord(entry)) return;
        const mealId = readMealType(readString(entry, ['meal_type', 'meal_category', 'type', 'time_of_day']));
        if (!mealId) return;
        meta[mealId] = {
          photoUrl: readString(entry, ['image_url']),
          time: localClock(readString(entry, ['eaten_at', 'created_at'])),
        };
        const type = readString(entry, ['feedback_type', 'type']);
        if (type === 'different_food') {
          statuses[mealId] = 'modified';
          const draft = mapLogDraft(entry, mealId);
          if (draft) records[mealId] = draft;
        } else if (type === 'eaten' || type === 'skipped') {
          statuses[mealId] = type;
        }
      });
      setLogStatusesByDate((current) => ({ ...current, [dateKey]: statuses }));
      setMealRecordsByDate((current) => ({ ...current, [dateKey]: records }));
      setMealLogMetaByDate((current) => ({ ...current, [dateKey]: meta }));
    } catch (error) {
      if (!isMountedRef.current || requestId !== mealLogsRequestRef.current) return;
      Alert.alert('식사 기록을 불러오지 못했어요', getDietApiErrorMessage(error));
    }
  }, []);

  const loadNutritionSummary = useCallback(async (dateKey: string) => {
    const requestId = ++nutritionSummaryRequestRef.current;
    setNutritionError(null);
    // the week's bars come with the day's numbers, so a meal recorded shows in both
    void loadWeekCalories(weekStartOf(dateKey), toDateKey(new Date()), getDietWeeklySummary, getDietNutritionSummary)
      .then((days) => { if (isMountedRef.current && requestId === nutritionSummaryRequestRef.current) setWeekCalories(days); })
      .catch(() => undefined);
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

  const loadFeedback = useCallback(async (planId: string) => {
    try {
      const response = await getWeeklyDietFeedback(planId);
      if (isMountedRef.current) setFeedback({ planId, list: response.feedback ?? [], legacy: response.legacy_feedback ?? [] });
    } catch {
      // an older server: the meal logs still tell what was recorded
    }
  }, []);

  const loadWeeklyPlan = useCallback(async (weekStart: string) => {
    const requestId = ++weeklyRequestRef.current;
    setWeeklyLoading(true);
    setWeeklyError(null);
    try {
      const plan = await getWeeklyDiet(weekStart);
      if (!isMountedRef.current || requestId !== weeklyRequestRef.current) return;
      setWeeklyPlan(plan);
      void loadFeedback(plan.weekly_diet_plan_id);
    } catch (error) {
      if (!isMountedRef.current || requestId !== weeklyRequestRef.current) return;
      setWeeklyPlan(null);
      if (errorCode(error) !== 'WEEKLY_DIET_NOT_FOUND') setWeeklyError(getDietApiErrorMessage(error));
    } finally {
      if (isMountedRef.current && requestId === weeklyRequestRef.current) setWeeklyLoading(false);
    }
  }, [loadFeedback]);

  const loadRebalance = useCallback(() => {
    void getRebalanceStatus().then(
      (status) => { if (isMountedRef.current) setRebalance(status); },
      () => { if (isMountedRef.current) setRebalance(null); },
    );
  }, []);

  useFocusEffect(useCallback(() => {
    void loadWeeklyPlan(selectedWeek);
  }, [loadWeeklyPlan, selectedWeek]));

  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      void loadNutritionSummary(selectedDateKey);
      void loadMealLogs(selectedDateKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadMealLogs, loadNutritionSummary, selectedDateKey]));

  useFocusEffect(useCallback(() => {
    loadRebalance();
    void getDietPreferences().then(
      (response) => { if (isMountedRef.current) setMenuStyle(response.preferences?.menu_style_preference ?? null); },
      () => undefined,
    );
  }, [loadRebalance]));

  const reloadAfterChange = useCallback((dateKey: string) => {
    void loadMealLogs(dateKey);
    void loadNutritionSummary(dateKey);
    void loadWeeklyPlan(weekStartOf(dateKey));
    loadRebalance();
  }, [loadMealLogs, loadNutritionSummary, loadRebalance, loadWeeklyPlan]);

  // One record against the week's plan; the plan's version guards it (409 = the plan changed: read it again).
  const saveFeedback = useCallback(
    async (mealId: MealType, input: { feedback_type: WeeklyFeedbackType; eaten_at?: string | null; actual_items?: DietActualItem[] }) => {
      const meal = shownMeals.find((candidate) => candidate.id === mealId);
      if (!weeklyPlan || !meal?.weekly) throw new Error('식단 정보를 다시 불러온 뒤 시도해 주세요.');
      const response = await saveWeeklyDietFeedback(
        weeklyPlan.weekly_diet_plan_id,
        meal.weekly.day,
        mealId,
        { ...input, expected_version: weeklyPlan.version },
        weekly.recorded.has(mealId),
      );
      if (input.feedback_type !== 'skipped' && response.meal_log_id) {
        // A point-service outage must not undo a meal that was already recorded.
        void awardTierActivity('meal_log', response.meal_log_id).catch(() => undefined);
      }
      return response;
    },
    [shownMeals, weekly.recorded, weeklyPlan],
  );

  const failedSave = useCallback((title: string, error: unknown, dateKey: string) => {
    if (isConflict(error)) {
      reloadAfterChange(dateKey);
      Alert.alert(title, '식단이나 기록이 바뀌어서 다시 불러왔어요. 한 번 더 눌러 주세요.');
    } else {
      Alert.alert(title, getDietApiErrorMessage(error));
    }
  }, [reloadAfterChange]);

  const markBusy = (mealId: MealType, busy: boolean) => {
    if (busy) feedbackRequestMealIdsRef.current.add(mealId);
    else feedbackRequestMealIdsRef.current.delete(mealId);
    setFeedbackMealIds((current) => {
      const next = new Set(current);
      if (busy) next.add(mealId);
      else next.delete(mealId);
      return next;
    });
  };

  const submitFeedback = useCallback(
    async (mealId: MealType, status: Extract<MealStatus, 'eaten' | 'skipped'>) => {
      if (feedbackRequestMealIdsRef.current.has(mealId)) return false;
      const dateKey = selectedDateKey;
      const update = weekly.recorded.has(mealId);
      markBusy(mealId, true);
      try {
        await saveFeedback(mealId, status === 'eaten'
          ? { feedback_type: 'eaten', eaten_at: new Date().toISOString(), ...(update ? { actual_items: [] } : {}) }
          : { feedback_type: 'skipped', ...(update ? { actual_items: [], eaten_at: null } : {}) });
        if (!isMountedRef.current) return false;
        setMealRecordsByDate((current) => {
          const dateRecords = current[dateKey];
          if (!dateRecords?.[mealId]) return current;
          const nextDateRecords = { ...dateRecords };
          delete nextDateRecords[mealId];
          return { ...current, [dateKey]: nextDateRecords };
        });
        reloadAfterChange(dateKey);
        return true;
      } catch (error) {
        if (isMountedRef.current) failedSave('식사 상태를 저장하지 못했어요', error, dateKey);
        return false;
      } finally {
        if (isMountedRef.current) markBusy(mealId, false);
      }
    },
    [failedSave, reloadAfterChange, saveFeedback, selectedDateKey, weekly.recorded],
  );

  const completeMealRecord = useCallback(
    async (draft: MealRecordDraft) => {
      const mealId = draft.mealId as MealType;
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
        feedbackRequestMealIdsRef.current.has(mealId) ||
        actualItems.length < 1 ||
        actualItems.length > 20 ||
        actualItems.some((item) => !item.food_name || !item.unit || (typeof item.quantity === 'number' && item.quantity <= 0))
      ) {
        Alert.alert('식사 기록을 저장할 수 없어요', '음식명, 수량, 단위를 확인해 주세요.');
        return false;
      }

      const dateKey = selectedDateKey;
      let feedbackSaved = false;
      markBusy(mealId, true);
      try {
        const response = await saveFeedback(mealId, { actual_items: actualItems, eaten_at: new Date().toISOString(), feedback_type: 'different_food' });
        feedbackSaved = true;
        if (draft.photoUri) {
          if (!response.meal_log_id) throw new Error('식사는 기록됐지만 사진을 연결할 식사 기록을 찾지 못했어요.');
          try {
            await uploadDietMealPhoto(response.meal_log_id, { fileName: draft.photoFileName, mimeType: draft.photoMimeType, uri: draft.photoUri });
          } catch (error) {
            // A lost success response can be retried and return 409 because the same meal log
            // already owns the uploaded photo. In that case the desired state is complete.
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
          }
        }
        if (!isMountedRef.current) return false;
        setMealRecordsByDate((current) => ({ ...current, [dateKey]: { ...(current[dateKey] ?? {}), [mealId]: draft } }));
        setRecordingMealId(null);
        reloadAfterChange(dateKey);
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          if (feedbackSaved) {
            Alert.alert('식사는 기록했지만 사진을 저장하지 못했어요', `${getDietApiErrorMessage(error)}\n사진 저장을 다시 시도해 주세요.`);
          } else {
            failedSave('식사 기록을 저장하지 못했어요', error, dateKey);
          }
        }
        return false;
      } finally {
        if (isMountedRef.current) markBusy(mealId, false);
      }
    },
    [failedSave, reloadAfterChange, saveFeedback, selectedDateKey],
  );

  const regenerateMeal = useCallback(
    async (mealId: MealType) => {
      const meal = shownMeals.find((candidate) => candidate.id === mealId);
      if (!weeklyPlan || !meal?.weekly || regenerateRequestMealIdsRef.current.has(mealId)) return;
      regenerateRequestMealIdsRef.current.add(mealId);
      setRegeneratingMealIds((current) => new Set(current).add(mealId));
      try {
        const plan = await regenerateWeeklyDietMeal(weeklyPlan.weekly_diet_plan_id, meal.weekly.day, mealId, weeklyPlan.version);
        if (isMountedRef.current) setWeeklyPlan(plan);
      } catch (error) {
        if (isMountedRef.current) failedSave('식단을 다시 추천하지 못했어요', error, selectedDateKey);
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
    [failedSave, selectedDateKey, shownMeals, weeklyPlan],
  );

  const requestAlternativeMeal = useCallback((mealId: MealType) => {
    Alert.alert('다른 식단을 추천받을까요?', '선택한 끼니만 새로운 식단으로 바꿔드려요.', [
      { style: 'cancel', text: '취소' },
      { onPress: () => void regenerateMeal(mealId), text: '새로 추천받기' },
    ]);
  }, [regenerateMeal]);

  const saveMenuStyle = async (style: Exclude<MenuStylePreference, null>) => {
    setStyleSheet({ open: true, saving: true, error: '' });
    try {
      const response = await saveDietPreferences(style);
      if (!isMountedRef.current) return;
      setMenuStyle(response.preferences?.menu_style_preference ?? style);
      setStyleSheet({ open: false, saving: false, error: '' });
    } catch (error) {
      if (isMountedRef.current) setStyleSheet({ open: true, saving: false, error: getDietApiErrorMessage(error) });
    }
  };

  // 내일 맞추기: the server reckons today's food, workout and goal; the app only shows them and asks.
  const tomorrowDate = rebalance?.tomorrow_plan.date ?? null;
  const tomorrowSource = tomorrowDate && weeklyPlan && weekStartOf(tomorrowDate) === weeklyPlan.week_start_date ? weeklyPlan : tomorrowWeek;
  const tomorrowMeals = tomorrowDate ? mapWeeklyMeals(tomorrowSource, tomorrowDate) : [];
  const overToday = rebalance && rebalance.target_status === 'available' && rebalance.today.decision === 'none'
    ? rebalance.today.overage_kcal
    : null;

  const runPreview = async (mealTypes: MealType[]) => {
    const plan = rebalance?.tomorrow_plan;
    if (!plan?.weekly_diet_plan_id || plan.version == null) {
      setTomorrowError('내일 식단이 아직 없어요.');
      setTomorrowState('error');
      return;
    }
    pickedRef.current = mealTypes;
    setTomorrowState('loading');
    try {
      const preview = await previewRebalance(plan.weekly_diet_plan_id, plan.version, mealTypes);
      if (!isMountedRef.current) return;
      previewIdRef.current = preview.preview_id;
      setTomorrowPlanPreview(previewPlan(preview, mealPresentation));
      setTomorrowState('ready');
    } catch (error) {
      if (!isMountedRef.current) return;
      if (isConflict(error)) loadRebalance();
      setTomorrowError(rebalanceError(error));
      setTomorrowState('error');
    }
  };

  const tomorrowProps: Omit<TomorrowSheetProps, 'visible'> = {
    over: Math.round(rebalance?.today.overage_kcal ?? 0),
    eaten: rebalance?.today.consumed_kcal ?? null,
    target: rebalance?.today.target_kcal ?? null,
    burned: rebalance?.today.total_burned_kcal ?? null,
    state: tomorrowState,
    tomorrow: tomorrowMeals.map((meal) => ({ slot: meal.title, menu: meal.foods, kcal: meal.kcal ?? null })),
    plan: tomorrowPlanPreview,
    error: tomorrowError,
    onClose: () => setTomorrowOpen(false),
    onRetry: () => void runPreview(pickedRef.current),
    onCheat: () => {
      void saveRebalanceCheat().then(
        () => { if (isMountedRef.current) { setTomorrowOpen(false); loadRebalance(); } },
        (error) => Alert.alert('저장하지 못했어요', getDietApiErrorMessage(error)),
      );
    },
    onAdjust: () => {
      setTomorrowState('pick');
      if (tomorrowDate && (!weeklyPlan || weekStartOf(tomorrowDate) !== weeklyPlan.week_start_date)) {
        void getWeeklyDiet(weekStartOf(tomorrowDate)).then(
          (plan) => { if (isMountedRef.current) setTomorrowWeek(plan); },
          () => { if (isMountedRef.current) setTomorrowWeek(null); },
        );
      }
    },
    onPick: (slots) => {
      const types = (Object.keys(mealPresentation) as MealType[]).filter((type) => slots.includes(mealPresentation[type]));
      void runPreview(types);
    },
    onSave: () => {
      const planId = rebalance?.tomorrow_plan.weekly_diet_plan_id;
      const previewId = previewIdRef.current;
      if (!planId || !previewId) return;
      setTomorrowState('saving');
      void confirmRebalance(planId, previewId).then(
        () => {
          if (!isMountedRef.current) return;
          setTomorrowState('saved');
          reloadAfterChange(selectedDateKey);
          if (tomorrowDate) void getWeeklyDiet(weekStartOf(tomorrowDate)).then((plan) => { if (isMountedRef.current) setTomorrowWeek(plan); }, () => undefined);
        },
        (error) => {
          if (!isMountedRef.current) return;
          if (isConflict(error)) loadRebalance();
          setTomorrowError(rebalanceError(error));
          setTomorrowState('error');
        },
      );
    },
  };

  const moveSelectedDate = (amount: number) => {
    const nextOffset = Math.max(dateWindowMin, Math.min(dateWindowMax, selectedDateOffset + amount));
    if (nextOffset === selectedDateOffset) return;
    setSelectedDateOffset(nextOffset);
    setSelectedDateKey(toDateKey(addDays(today, nextOffset)));
  };

  return (
    <View style={{ flex: 1 }}>
      <DietView
        week={weekCalories}
        today={today}
        selectedDateOffset={selectedDateOffset}
        selectedDateKey={selectedDateKey}
        goals={displayedNutritionGoals}
        nutritionError={nutritionError}
        hasUnknownItems={nutritionSummary?.date === selectedDateKey && Boolean(nutritionSummary.has_unknown_items)}
        meals={shownMeals.map((meal: Meal) => {
          const record = mealRecordsByDate[selectedDateKey]?.[meal.id];
          const log = mealLogMetaByDate[selectedDateKey]?.[meal.id];
          const recordedFoods = record?.foods;
          const status = selectedStatuses[meal.id];
          // A different food the user recorded is not the recommended menu, so it stays as saved.
          const notice = status === 'modified' ? null : mealAllergyNotice(meal, allergyNames);
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
            // recorded earlier in the daily app: shown as recorded, not saved twice
            canSave: feedbackEnabled && Boolean(meal.weekly) && !weekly.locked.has(meal.id),
            pending: feedbackMealIds.has(meal.id),
            regenerating: regeneratingMealIds.has(meal.id),
            allergyWarning: notice?.message ?? null,
            allergyBlocked: Boolean(notice?.blocked),
            canRegenerateDay: false,
          };
        })}
        mealsLoading={weeklyLoading}
        mealsError={weeklyError}
        onMakeWeek={() => router.push('/diet/weekly')}
        onSelectDateOffset={(offset) => moveSelectedDate(offset - selectedDateOffset)}
        onRetryNutrition={() => void loadNutritionSummary(selectedDateKey)}
        onRetryMeals={() => void loadWeeklyPlan(selectedWeek)}
        onRecord={setRecordingMealId}
        onStatusChange={(mealId, status) => void submitFeedback(mealId, status)}
        onAlternative={requestAlternativeMeal}
        onRegenerateDay={() => router.push('/diet/weekly')}
        dayRegenerating={false}
        onOpenRecipe={(mealId) => {
          const meal = shownMeals.find((item) => item.id === mealId);
          if (meal?.weekly) {
            router.push({ pathname: '/diet/weekly-recipe', params: { planId: meal.weekly.planId, day: meal.weekly.day, mealType: meal.id } });
          }
        }}
        onOpenProteinGuide={() => router.push({ pathname: '/diet/protein-guide', params: { date: selectedDateKey } })}
        onOpenWeekly={() => router.push('/diet/weekly')}
        showRecordControls={showRecordControls}
        menuStyle={menuStyle ?? null}
        onMenuStyle={menuStyle === undefined ? undefined : () => setStyleSheet({ open: true, saving: false, error: '' })}
        over={rebalance ? overToday : undefined}
        burned={rebalance?.today.total_burned_kcal ?? null}
        onAdjust={overToday && overToday > 0 ? () => {
          setTomorrowState('choose');
          setTomorrowPlanPreview(null);
          setTomorrowError('');
          setTomorrowOpen(true);
        } : undefined}
      />
      <MealRecordSheets
        initialDraft={recordingMealId ? mealRecordsByDate[selectedDateKey]?.[recordingMealId] : undefined}
        mealId={recordingMealId}
        onClose={() => setRecordingMealId(null)}
        onComplete={completeMealRecord}
        visible={recordingMealId !== null}
      />
      <MenuStyleSheet
        error={styleSheet.error}
        onClose={() => setStyleSheet({ open: false, saving: false, error: '' })}
        onSave={(style) => void saveMenuStyle(style)}
        saving={styleSheet.saving}
        value={menuStyle ?? null}
        visible={styleSheet.open}
      />
      <TomorrowSheet visible={tomorrowOpen} {...tomorrowProps} />
    </View>
  );
}
