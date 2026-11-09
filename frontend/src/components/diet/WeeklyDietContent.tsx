import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { koreanDate } from '@/src/lib/koreanDate';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import { ApiError } from '@/src/api/client';
import { mealAllergyNotice } from '@/src/features/diet/allergyConflict';
import { plainFoodName } from '@/src/features/diet/foodName';
import { macroLabel, mapRecommendationMeals, mapWeeklyMeals, type Meal } from '@/src/features/diet/dayMeals';
import { mergeDayMeals, weekDates } from '@/src/features/diet/weeklyMeals';
import {
  generateDietRecommendations, generateWeeklyDiet, getDietApiErrorMessage, getDietRecommendationsByDate, getWeeklyDiet,
  regenerateDietMeal, regenerateWeeklyDietMeal, type WeeklyPlan,
} from '@/src/api/diet';
import { Text } from '@/src/components/common';
import { useAllergyNames } from '@/src/features/diet/useAllergyNames';
import { weeklyDietErrorCode } from '@/src/features/diet/weeklyDietErrors';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const weekdayOf = (date: string) => weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
const MACRO_NAMES = ['탄수화물', '단백질', '지방'];

function mondayInKorea() {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  return today;
}

function todayInKorea() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function weekKey(week: Date) { return week.toISOString().slice(0, 10); }
function moveWeek(week: Date, amount: number) {
  const next = new Date(week);
  next.setUTCDate(next.getUTCDate() + 7 * amount);
  return next;
}

export function WeeklyDietContent() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const [week, setWeek] = useState(mondayInKorea);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [daily, setDaily] = useState<{ week: string; meals: Record<string, Meal[]> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  // State only updates after a render, so a double tap could otherwise send two paid requests.
  const requestBusy = useRef(false);
  const [error, setError] = useState('');
  const [mealError, setMealError] = useState<{ slot: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const allergyNames = useAllergyNames();
  const start = weekKey(week);
  // Only this week's data may be shown.
  const shownPlan = plan?.week_start_date === start ? plan : null;
  const shownDaily = daily?.week === start ? daily.meals : null;
  const [today] = useState(todayInKorea);
  const requestKey = `${start}:${reload}`;
  const days = shownDaily
    ? weekDates(start)
      .map((date) => ({ date, meals: mergeDayMeals(shownDaily[date] ?? [], mapWeeklyMeals(shownPlan, date)) }))
      .filter((day) => day.meals.length > 0)
    : [];

  useFocusEffect(useCallback(() => {
    let active = true;
    const weekStart = requestKey.slice(0, 10);
    setLoading(true);
    setError('');
    const savedWeek = getWeeklyDiet(weekStart).catch((cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 404 && weeklyDietErrorCode(cause.detail) === 'WEEKLY_DIET_NOT_FOUND') return null;
      throw cause;
    });
    const dailyMeals = Promise.all(weekDates(weekStart).map(async (date) => {
      const response = await getDietRecommendationsByDate(date);
      return [date, mapRecommendationMeals(response.result)] as const;
    }));
    void Promise.all([savedWeek, dailyMeals]).then(([nextPlan, nextDaily]) => {
      if (!active) return;
      setPlan(nextPlan);
      setDaily({ week: weekStart, meals: Object.fromEntries(nextDaily) });
    }).catch((cause: unknown) => {
      if (!active) return;
      // Older meals must not stay on screen as current ones after an allergy change.
      setPlan(null);
      setDaily(null);
      setError(getDietApiErrorMessage(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestKey]));

  const generate = async () => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setPending('generate');
    setError('');
    setMealError(null);
    try {
      setPlan(await generateWeeklyDiet(start));
    } catch (cause) {
      setError(getDietApiErrorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) setReload((value) => value + 1);
    } finally { requestBusy.current = false; setPending(''); }
  };

  // A daily meal is replaced through its daily id, so the screen and the diet tab keep showing the same menu.
  const regenerate = async (date: string, meal: Meal) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    const slot = `${date}:${meal.id}`;
    setPending(slot);
    setError('');
    setMealError(null);
    try {
      if (meal.weekly && plan) {
        setPlan(await regenerateWeeklyDietMeal(meal.weekly.planId, meal.weekly.day, meal.id, plan.version));
      } else if (meal.dietMealId) {
        await regenerateDietMeal(meal.dietMealId);
        setReload((value) => value + 1);
      }
    } catch (cause) {
      setMealError({ slot, message: `${getDietApiErrorMessage(cause)} 지금 메뉴는 그대로예요.` });
      if (cause instanceof ApiError && cause.status === 409) setReload((value) => value + 1);
    } finally { requestBusy.current = false; setPending(''); }
  };

  const regenerateToday = async () => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setPending('day');
    setError('');
    setMealError(null);
    try {
      await generateDietRecommendations();
      setReload((value) => value + 1);
    } catch (cause) {
      setError(getDietApiErrorMessage(cause));
    } finally { requestBusy.current = false; setPending(''); }
  };

  const openRecipe = (date: string, meal: Meal) => {
    if (meal.weekly) {
      router.push({ pathname: '/diet/weekly-recipe', params: { planId: meal.weekly.planId, day: meal.weekly.day, mealType: meal.id } });
    } else if (meal.dietMealId) {
      router.push({ pathname: '/diet/recipe', params: { date, mealId: meal.dietMealId } });
    }
  };

  const canRegenerate = (date: string, meal: Meal) =>
    Boolean(meal.weekly) || (date === today && meal.recommendationStatus === 'recommended');

  return <View style={s.content}>
    <View style={s.weekRow}>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="이전 주" onPress={() => setWeek(moveWeek(week, -1))} style={s.weekButton}><CaretLeftIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
      <View style={s.weekText}><Text style={s.weekTitle}>{koreanDate(start)}부터 7일</Text></View>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => setWeek(moveWeek(week, 1))} style={s.weekButton}><CaretRightIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
    </View>
    {Boolean(error) && <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)}><Text style={s.outlineText}>다시 불러오기</Text></Pressable></View>}
    {loading && !shownDaily ? <ActivityIndicator color={colors.primaryText} style={s.loading} /> : shownDaily ? <>
      {Boolean(shownPlan?.result.summary) && <Text numberOfLines={shownPlan?.result.strategy && !detailOpen ? 3 : undefined} style={s.summary}>{shownPlan?.result.summary}</Text>}
      {Boolean(shownPlan?.result.strategy) && <>
        {detailOpen && <Text style={s.muted}>{shownPlan?.result.strategy}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailOpen }} onPress={() => setDetailOpen((value) => !value)} style={[s.smallOutline, s.detailButton]}><Text style={s.outlineText}>{detailOpen ? '접기' : '자세히 보기'}</Text></Pressable>
      </>}
      {days.map(({ date, meals }) => <View key={date} style={s.daySection}>
        <Text style={s.dayTitle}>{weekdayOf(date)}요일 <Text style={s.date}>{koreanDate(date)}</Text></Text>
        {meals.map((meal) => {
          const slot = `${date}:${meal.id}`;
          const macros = macroLabel(meal.macroItems, MACRO_NAMES, ' · ');
          const notice = meal.recommendationStatus === 'modified' ? null : mealAllergyNotice(meal, allergyNames);
          return <View key={meal.id} style={s.mealCard}>
            <View style={s.mealHead}><Text style={s.mealLabel}>{meal.title}</Text>{meal.kcal == null ? null : <Text style={s.kcal}>{meal.kcal} kcal</Text>}</View>
            <Text style={s.mealTitle}>{meal.foods}</Text>
            {notice && <Text accessibilityRole={notice.blocked ? 'alert' : undefined} style={notice.blocked ? s.errorText : s.guidance}>{notice.message}</Text>}
            {Boolean(meal.description) && <Text style={s.muted}>{meal.description}</Text>}
            {meal.intake.length > 0 && <Text style={s.foods}>{meal.intake.map(([name, amount]) => [plainFoodName(name), amount].filter(Boolean).join(' ')).join(' · ')}</Text>}
            {Boolean(macros) && <Text style={s.foods}>{macros}</Text>}
            {Boolean(meal.note) && <Text style={s.guidance}>{meal.note}</Text>}
            {mealError?.slot === slot && <Text accessibilityRole="alert" style={s.errorText}>{mealError.message}</Text>}
            <View style={s.actions}>
              {notice?.blocked ? null : <Pressable accessibilityRole="button" onPress={() => openRecipe(date, meal)} style={s.recipeButton}><Text style={s.recipeText}>레시피 보기</Text></Pressable>}
              {notice?.regenerateDay && date === today ? <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => Alert.alert('오늘 식단을 다시 추천받을까요?', '오늘 식단 전체가 새 추천으로 바뀌어요.', [{ text: '취소', style: 'cancel' }, { text: '다시 추천', onPress: () => void regenerateToday() }])} style={s.smallOutline}><Text style={s.outlineText}>{pending === 'day' ? '추천 중…' : '하루 식단 다시 추천'}</Text></Pressable> : null}
              {canRegenerate(date, meal) && !notice?.regenerateDay ? <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => Alert.alert('메뉴 다시 추천', `${weekdayOf(date)}요일 ${meal.title} 메뉴를 바꿀까요?`, [{ text: '취소', style: 'cancel' }, { text: '다시 추천', onPress: () => void regenerate(date, meal) }])} style={s.smallOutline}><Text style={s.outlineText}>{pending === slot ? '추천 중…' : '다시 추천'}</Text></Pressable> : null}
            </View>
          </View>;
        })}
      </View>)}
      {!shownPlan && !error ? <View style={s.empty}><Text style={s.emptyTitle}>{days.length > 0 ? '나머지 날 식단이 아직 없어요' : '이 주의 식단이 아직 없어요'}</Text><Text style={s.muted}>7일 식단을 생성하면 하루 네 끼씩 확인할 수 있어요.</Text><Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => void generate()} style={s.recipeButton}><Text style={s.recipeText}>{pending ? '생성 중…' : '7일 식단 만들기'}</Text></Pressable></View> : null}
    </> : null}
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  return {
    content: { gap: 14 },
    weekRow: { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8 }, weekButton: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' }, weekText: { flex: 1, alignItems: 'center' }, weekTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 }, loading: { marginTop: 40 },
    summary: { fontSize: 16, color: colors.textPrimary, lineHeight: 24, fontFamily: fontFamilies.pretendardBold }, outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, padding: 12, borderRadius: 12, alignItems: 'center' }, outlineText: { color: colors.primaryText, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    daySection: { gap: 10, marginTop: 14 }, dayTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, date: { fontSize: 14, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    mealCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 7 }, mealHead: { flexDirection: 'row', justifyContent: 'space-between' }, mealLabel: { fontSize: 14, color: colors.primaryText, fontFamily: fontFamilies.pretendardMedium }, kcal: { fontSize: 14, color: colors.textSecondary }, mealTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, foods: { fontSize: 14, color: colors.textBody, lineHeight: 21 }, guidance: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 }, actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, recipeButton: { backgroundColor: colors.primaryLight, borderRadius: 8, minHeight: 34, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }, recipeText: { color: colors.primaryText, fontSize: 14, fontFamily: fontFamilies.pretendardMedium }, smallOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 34, paddingHorizontal: 16, justifyContent: 'center' }, detailButton: { alignSelf: 'flex-start' },
    empty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, gap: 12 }, emptyTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, error: { padding: 14, backgroundColor: colors.dangerLight, borderRadius: 12, gap: 10 }, errorText: { color: colors.danger, fontSize: 14 },
  } as const;
}
