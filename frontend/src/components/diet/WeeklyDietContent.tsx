import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { ApiError } from '@/src/api/client';
import { plainFoodName } from '@/src/features/diet/foodName';
import {
  generateWeeklyDiet, getDietApiErrorMessage, getWeeklyDiet, regenerateWeeklyDietMeal,
  type WeeklyDay, type WeeklyMealType, type WeeklyPlan,
} from '@/src/api/diet';
import { Text } from '@/src/components/common';
import { weeklyDietErrorCode } from '@/src/features/diet/weeklyDietErrors';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const days: Record<WeeklyDay, string> = { monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금', saturday: '토', sunday: '일' };
const meals: { key: WeeklyMealType; label: string }[] = [
  { key: 'breakfast', label: '아침' }, { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' }, { key: 'snack', label: '간식' },
];

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
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  // State only updates after a render, so a double tap could otherwise send two paid requests.
  const requestBusy = useRef(false);
  const [error, setError] = useState('');
  const [mealError, setMealError] = useState<{ slot: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const start = weekKey(week);
  // A failed refresh keeps what is on screen; only this week's plan may be shown.
  const shownPlan = plan?.week_start_date === start ? plan : null;
  const requestKey = `${start}:${reload}`;

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getWeeklyDiet(requestKey.slice(0, 10)).then((result) => {
      if (active) setPlan(result);
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 404 && weeklyDietErrorCode(cause.detail) === 'WEEKLY_DIET_NOT_FOUND') {
        setPlan(null);
      } else {
        setError(getDietApiErrorMessage(cause));
      }
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

  const regenerate = async (day: WeeklyDay, mealType: WeeklyMealType) => {
    if (!plan || requestBusy.current) return;
    requestBusy.current = true;
    const slot = `${day}:${mealType}`;
    setPending(slot);
    setError('');
    setMealError(null);
    try {
      setPlan(await regenerateWeeklyDietMeal(plan.weekly_diet_plan_id, day, mealType, plan.version));
    } catch (cause) {
      setMealError({ slot, message: `${getDietApiErrorMessage(cause)} 지금 메뉴는 그대로예요.` });
      if (cause instanceof ApiError && cause.status === 409) setReload((value) => value + 1);
    } finally { requestBusy.current = false; setPending(''); }
  };

  return <View style={s.content}>
    <View style={s.weekRow}>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="이전 주" onPress={() => setWeek(moveWeek(week, -1))} style={s.weekButton}><Text style={s.weekArrow}>‹</Text></Pressable>
      <View style={s.weekText}><Text style={s.weekTitle}>{start}부터 7일</Text><Text style={s.muted}>한국 시간 기준</Text></View>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => setWeek(moveWeek(week, 1))} style={s.weekButton}><Text style={s.weekArrow}>›</Text></Pressable>
    </View>
    {Boolean(error) && <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)}><Text style={s.outlineText}>다시 불러오기</Text></Pressable></View>}
    {loading && !shownPlan ? <ActivityIndicator color={colors.primaryText} style={s.loading} /> : shownPlan ? <>
      {Boolean(shownPlan.result.summary) && <Text style={s.summary}>{shownPlan.result.summary}</Text>}
      {Boolean(shownPlan.result.strategy) && <Text style={s.muted}>{shownPlan.result.strategy}</Text>}
      {shownPlan.result.weekly_plan.map((entry) => <View key={entry.day} style={s.daySection}>
        <Text style={s.dayTitle}>{days[entry.day]}요일 <Text style={s.date}>{entry.date}</Text></Text>
        {meals.map(({ key, label }) => {
          const meal = entry.meals[key];
          return <View key={key} style={s.mealCard}>
            <View style={s.mealHead}><Text style={s.mealLabel}>{label}</Text><Text style={s.kcal}>{Math.round(meal.estimated_calories_kcal)} kcal</Text></View>
            <Text style={s.mealTitle}>{plainFoodName(meal.menu_name)}</Text>
            {Boolean(meal.menu_description) && <Text style={s.muted}>{meal.menu_description}</Text>}
            <Text style={s.foods}>{meal.items.map((item) => `${plainFoodName(item.food_name)} ${item.portion_g}g`).join(' · ')}</Text>
            <Text style={s.foods}>탄수화물 {Math.round(meal.nutrition.carbohydrate_g)}g · 단백질 {Math.round(meal.nutrition.protein_g)}g · 지방 {Math.round(meal.nutrition.fat_g)}g</Text>
            {Boolean(meal.guidance) && <Text style={s.guidance}>{meal.guidance}</Text>}
            {mealError?.slot === `${entry.day}:${key}` && <Text accessibilityRole="alert" style={s.errorText}>{mealError.message}</Text>}
            <View style={s.actions}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/diet/weekly-recipe', params: { planId: shownPlan.weekly_diet_plan_id, day: entry.day, mealType: key } })} style={s.recipeButton}><Text style={s.recipeText}>레시피 보기</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => Alert.alert('메뉴 다시 추천', `${days[entry.day]}요일 ${label} 메뉴를 바꿀까요?`, [{ text: '취소', style: 'cancel' }, { text: '다시 추천', onPress: () => void regenerate(entry.day, key) }])} style={s.smallOutline}><Text style={s.outlineText}>{pending === `${entry.day}:${key}` ? '추천 중…' : '다시 추천'}</Text></Pressable>
            </View>
          </View>;
        })}
      </View>)}
    </> : !error ? <View style={s.empty}><Text style={s.emptyTitle}>이 주의 식단이 아직 없어요</Text><Text style={s.muted}>7일 식단을 생성하면 하루 네 끼씩 확인할 수 있어요.</Text><Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => void generate()} style={s.recipeButton}><Text style={s.recipeText}>{pending ? '생성 중…' : '7일 식단 만들기'}</Text></Pressable></View> : null}
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  return {
    content: { gap: 14 },
    weekRow: { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8 }, weekButton: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' }, weekArrow: { fontSize: 28, color: colors.primaryText }, weekText: { flex: 1, alignItems: 'center' }, weekTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 }, loading: { marginTop: 40 },
    summary: { fontSize: 16, color: colors.textPrimary, lineHeight: 24, fontFamily: fontFamilies.pretendardBold }, outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, padding: 12, borderRadius: 12, alignItems: 'center' }, outlineText: { color: colors.primaryText, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    daySection: { gap: 10, marginTop: 14 }, dayTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, date: { fontSize: 14, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    mealCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 7 }, mealHead: { flexDirection: 'row', justifyContent: 'space-between' }, mealLabel: { fontSize: 14, color: colors.primaryText, fontFamily: fontFamilies.pretendardMedium }, kcal: { fontSize: 14, color: colors.textSecondary }, mealTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, foods: { fontSize: 14, color: colors.textBody, lineHeight: 21 }, guidance: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 }, actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, recipeButton: { backgroundColor: colors.primaryLight, borderRadius: 8, minHeight: 34, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }, recipeText: { color: colors.primaryText, fontSize: 14, fontFamily: fontFamilies.pretendardMedium }, smallOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 34, paddingHorizontal: 16, justifyContent: 'center' },
    empty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, gap: 12 }, emptyTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold }, error: { padding: 14, backgroundColor: colors.dangerLight, borderRadius: 12, gap: 10 }, errorText: { color: colors.danger, fontSize: 14 },
  } as const;
}
