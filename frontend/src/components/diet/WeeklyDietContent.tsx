import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { koreanDate } from '@/src/lib/koreanDate';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import { ApiError } from '@/src/api/client';
import { mealAllergyNotice } from '@/src/features/diet/allergyConflict';
import { plainFoodName } from '@/src/features/diet/foodName';
import { macroLabel, mapWeeklyMeals, type Meal } from '@/src/features/diet/dayMeals';
import { weekDates } from '@/src/features/diet/weeklyMeals';
import {
  generateWeeklyDiet, getDietApiErrorMessage, getWeeklyDiet, regenerateWeeklyDietMeal, type WeeklyPlan,
} from '@/src/api/diet';
import { aForm } from '@/src/components/a/form';
import { ALoading } from '@/src/components/a/ALoading';
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
  // The week whose answer came (a plan or none): until then the screen waits.
  const [loaded, setLoaded] = useState<string | null>(null);
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
  const shownWeek = loaded === start;
  const requestKey = `${start}:${reload}`;
  // As on the diet tab (agreed 11/19): a date shows the week's plan only, never the older daily recommendation.
  const days = shownWeek
    ? weekDates(start)
      .map((date) => ({ date, meals: mapWeeklyMeals(shownPlan, date) }))
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
    void savedWeek.then((nextPlan) => {
      if (!active) return;
      setPlan(nextPlan);
      setLoaded(weekStart);
    }).catch((cause: unknown) => {
      if (!active) return;
      // Older meals must not stay on screen as current ones after an allergy change.
      setPlan(null);
      setLoaded(null);
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

  // A meal is replaced in the week's plan, so the screen and the diet tab keep showing the same menu.
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
      }
    } catch (cause) {
      setMealError({ slot, message: `${getDietApiErrorMessage(cause)} 지금 메뉴는 그대로예요.` });
      if (cause instanceof ApiError && cause.status === 409) setReload((value) => value + 1);
    } finally { requestBusy.current = false; setPending(''); }
  };

  const openRecipe = (meal: Meal) => {
    if (meal.weekly) {
      router.push({ pathname: '/diet/weekly-recipe', params: { planId: meal.weekly.planId, day: meal.weekly.day, mealType: meal.id } });
    }
  };

  return <View style={s.content}>
    <View style={s.weekRow}>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="이전 주" onPress={() => setWeek(moveWeek(week, -1))} style={s.weekButton}><CaretLeftIcon color={colors.ink} height={14} width={14} /></Pressable>
      <View style={s.weekText}><Text style={s.weekTitle}>{koreanDate(start)}부터 7일</Text></View>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => setWeek(moveWeek(week, 1))} style={s.weekButton}><CaretRightIcon color={colors.ink} height={14} width={14} /></Pressable>
    </View>
    {Boolean(error) && <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)}><Text style={s.outlineText}>다시 불러오기</Text></Pressable></View>}
    {loading && !shownWeek ? <View style={s.loading}><ALoading /></View> : shownWeek ? <>
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
          const notice = mealAllergyNotice(meal, allergyNames);
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
              {notice?.blocked ? null : <Pressable accessibilityRole="button" onPress={() => openRecipe(meal)} style={s.recipeButton}><Text style={s.recipeText}>레시피 보기</Text></Pressable>}
              {meal.weekly ? <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => Alert.alert('메뉴 다시 추천', `${weekdayOf(date)}요일 ${meal.title} 메뉴를 바꿀까요?`, [{ text: '취소', style: 'cancel' }, { text: '다시 추천', onPress: () => void regenerate(date, meal) }])} style={s.smallOutline}><Text style={s.outlineText}>{pending === slot ? '추천 중…' : '다시 추천'}</Text></Pressable> : null}
            </View>
          </View>;
        })}
      </View>)}
      {!shownPlan && !error ? <View style={s.empty}><Text style={s.emptyTitle}>{days.length > 0 ? '나머지 날 식단이 아직 없어요' : '이 주의 식단이 아직 없어요'}</Text><Text style={s.muted}>7일 식단을 생성하면 하루 네 끼씩 확인할 수 있어요.</Text><Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => void generate()} style={s.recipeButton}><Text style={s.recipeText}>{pending ? '생성 중…' : '7일 식단 만들기'}</Text></Pressable></View> : null}
    </> : null}
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const mini = { ...a.mini, minHeight: 32 };
  return {
    content: { gap: 12 },
    // the week: ‹ name › as on the workout record
    weekRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    weekButton: { ...a.mini, paddingHorizontal: 0, width: 32 },
    weekText: { alignItems: 'center', flex: 1 },
    weekTitle: { ...a.p15, color: colors.ink },
    muted: { ...a.p12, color: colors.textBody },
    loading: { height: 460 },
    summary: { ...a.p15, color: colors.ink },
    outlineText: a.miniText,
    daySection: { gap: 10, marginTop: 10 },
    dayTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    date: { ...a.p12, color: colors.textSecondary },
    mealCard: { ...a.card, gap: 7, paddingHorizontal: 14, paddingVertical: 12 },
    mealHead: { flexDirection: 'row', justifyContent: 'space-between' },
    mealLabel: a.note,
    kcal: { ...a.p12, color: colors.textSecondary },
    mealTitle: { ...a.p15, color: colors.ink },
    foods: { ...a.p12, color: colors.textBody },
    guidance: { ...a.p12, color: colors.textBody },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    recipeButton: { ...mini, backgroundColor: colors.primary },
    recipeText: { ...a.miniText, color: colors.onPrimary },
    smallOutline: mini,
    detailButton: { alignSelf: 'flex-start' },
    empty: { ...a.card, gap: 12, padding: 16 },
    emptyTitle: { ...a.p15, color: colors.ink },
    error: { ...a.card, gap: 10, padding: 14 },
    // no red letters in A: what went wrong is said in dark letters
    errorText: { ...a.p12, color: colors.ink },
  } as const;
}
