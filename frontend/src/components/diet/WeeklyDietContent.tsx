import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/src/api/client';
import {
  generateWeeklyDiet, getDietApiErrorMessage, getWeeklyDiet, regenerateWeeklyDietMeal,
  type WeeklyDay, type WeeklyMealType, type WeeklyPlan,
} from '@/src/api/diet';
import { Text } from '@/src/components/common';
import { weeklyDietErrorCode } from '@/src/features/diet/weeklyDietErrors';
import { fontFamilies } from '@/src/theme';

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

export function WeeklyDietContent({ showHeader = false }: { showHeader?: boolean }) {
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

  const generate = async (expectedVersion?: number) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setPending('generate');
    setError('');
    setMealError(null);
    try {
      setPlan(await generateWeeklyDiet(start, expectedVersion));
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
    {showHeader && <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="식단으로 돌아가기" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><Text style={s.headerTitle}>7일 식단</Text></View>}
    <View style={s.weekRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 주" onPress={() => setWeek(moveWeek(week, -1))} style={s.weekButton}><Text style={s.weekArrow}>‹</Text></Pressable>
      <View style={s.weekText}><Text style={s.weekTitle}>{start}부터 7일</Text><Text style={s.muted}>한국 시간 기준</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => setWeek(moveWeek(week, 1))} style={s.weekButton}><Text style={s.weekArrow}>›</Text></Pressable>
    </View>
    {Boolean(error) && <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)}><Text style={s.outlineText}>다시 불러오기</Text></Pressable></View>}
    {loading && !shownPlan ? <ActivityIndicator color="#503DE1" style={s.loading} /> : shownPlan ? <>
      {Boolean(shownPlan.result.summary) && <Text style={s.summary}>{shownPlan.result.summary}</Text>}
      {Boolean(shownPlan.result.strategy) && <Text style={s.muted}>{shownPlan.result.strategy}</Text>}
      <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => Alert.alert('7일 식단 다시 만들기', '현재 주간 식단 28개 메뉴가 모두 바뀝니다.', [{ text: '취소', style: 'cancel' }, { text: '다시 만들기', onPress: () => void generate(shownPlan.version) }])} style={s.outline}><Text style={s.outlineText}>{pending === 'generate' ? '생성 중…' : '이번 주 전체 다시 만들기'}</Text></Pressable>
      {shownPlan.result.weekly_plan.map((entry) => <View key={entry.day} style={s.daySection}>
        <Text style={s.dayTitle}>{days[entry.day]}요일 <Text style={s.date}>{entry.date}</Text></Text>
        {meals.map(({ key, label }) => {
          const meal = entry.meals[key];
          return <View key={key} style={s.mealCard}>
            <View style={s.mealHead}><Text style={s.mealLabel}>{label}</Text><Text style={s.kcal}>{Math.round(meal.estimated_calories_kcal)} kcal</Text></View>
            <Text style={s.mealTitle}>{meal.menu_name}</Text>
            {Boolean(meal.menu_description) && <Text style={s.muted}>{meal.menu_description}</Text>}
            <Text style={s.foods}>{meal.items.map((item) => `${item.food_name} ${item.portion_g}g`).join(' · ')}</Text>
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

const s = StyleSheet.create({
  content: { gap: 14 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center' }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { fontSize: 34, color: '#1B1B22' }, headerTitle: { fontSize: 19, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold },
  weekRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 12, padding: 8 }, weekButton: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' }, weekArrow: { fontSize: 28, color: '#503DE1' }, weekText: { flex: 1, alignItems: 'center' }, weekTitle: { fontSize: 16, color: '#1B1B22', fontFamily: fontFamilies.pretendardSemiBold }, muted: { fontSize: 13, color: '#646670', lineHeight: 20 }, loading: { marginTop: 40 },
  summary: { fontSize: 16, color: '#1B1B22', lineHeight: 24, fontFamily: fontFamilies.pretendardSemiBold }, outline: { borderWidth: 1, borderColor: '#503DE1', padding: 12, borderRadius: 10, alignItems: 'center' }, outlineText: { color: '#503DE1', fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  daySection: { gap: 10, marginTop: 14 }, dayTitle: { fontSize: 19, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, date: { fontSize: 13, color: '#646670', fontFamily: fontFamilies.pretendardRegular },
  mealCard: { borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 12, padding: 14, gap: 7 }, mealHead: { flexDirection: 'row', justifyContent: 'space-between' }, mealLabel: { fontSize: 13, color: '#503DE1', fontFamily: fontFamilies.pretendardSemiBold }, kcal: { fontSize: 13, color: '#646670' }, mealTitle: { fontSize: 16, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, foods: { fontSize: 13, color: '#454650', lineHeight: 20 }, guidance: { fontSize: 13, color: '#646670', lineHeight: 20 }, actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, recipeButton: { backgroundColor: '#503DE1', borderRadius: 9, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center' }, recipeText: { color: '#FFFFFF', fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold }, smallOutline: { borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 9, paddingHorizontal: 15, paddingVertical: 10 },
  empty: { borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 12, padding: 20, gap: 12 }, emptyTitle: { fontSize: 17, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, error: { padding: 14, backgroundColor: '#FFF1F1', borderRadius: 10, gap: 10 }, errorText: { color: '#9A2525', fontSize: 13 },
});
