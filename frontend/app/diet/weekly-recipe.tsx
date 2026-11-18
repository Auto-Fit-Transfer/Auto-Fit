import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PlusIcon from '@/assets/icons/ui/plus.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import { aForm } from '@/src/components/a/form';
import { ALoading } from '@/src/components/a/ALoading';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getDietApiErrorMessage, getWeeklyDietRecipe, type WeeklyDay, type WeeklyMealType, type WeeklyRecipe, type WeeklyRecipeItem } from '@/src/api/diet';
import { plainFoodName } from '@/src/features/diet/foodName';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const dayNames: Record<WeeklyDay, string> = { monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금', saturday: '토', sunday: '일' };
const mealNames: Record<WeeklyMealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };
const days = Object.keys(dayNames) as WeeklyDay[];
const meals = Object.keys(mealNames) as WeeklyMealType[];
const sourceNames: Record<WeeklyRecipeItem['recipe_source'], string> = {
  official_exact: '식품안전나라 공식 레시피',
  official_similar: '식품안전나라 유사 레시피',
  llm_generated: 'AI 생성 레시피',
  unavailable: '레시피 제공 불가',
};

function formatNumber(value: number) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10); }

function RecipeItemCard({ item }: { item: WeeklyRecipeItem }) {
  const s = useThemedStyles(createSStyles);
  const detail = item.recipe_available ? item.recipe : null;
  const steps = detail?.step_details.length ? detail.step_details : detail?.steps.map((instruction, index) => ({ order: index + 1, instruction, duration_minutes: null, tip: null })) ?? [];
  return <View style={s.card}>
    <Text style={s.itemTitle}>{plainFoodName(item.food_name)}</Text>
    <Text style={s.muted}>{formatNumber(item.portion_g)}g · {Math.round(item.calories_kcal)} kcal</Text>
    <Text style={s.source}>{sourceNames[item.recipe_source]}</Text>
    {item.recipe_source === 'official_similar' && item.matched_recipe_name && <Text style={s.muted}>매칭된 메뉴: {item.matched_recipe_name}{item.match_score != null ? ` · 유사도 ${Math.round(item.match_score * 100)}%` : ''}</Text>}
    {item.restriction_matches.length > 0 && <Text style={s.warning}>제한 식품과 충돌: {item.restriction_matches.join(' · ')}</Text>}
    {!detail ? <Text style={s.muted}>{item.restriction_matches.length > 0 ? '제한 식품과 충돌해 조리법을 표시할 수 없어요.' : '조리법을 가져오지 못했어요. 잠시 후 다시 확인해 주세요.'}</Text> : <>
      {Boolean(detail.menu_name) && <Text style={s.recipeName}>{detail.menu_name}</Text>}
      <Text style={s.muted}>{[
        detail.cooking_method, detail.dish_type,
        detail.estimated_duration_minutes == null ? null : `조리 ${formatNumber(detail.estimated_duration_minutes)}분`,
        detail.serving_weight == null ? null : `완성 ${formatNumber(detail.serving_weight)}g`,
      ].filter(Boolean).join(' · ')}</Text>
      <Text style={s.sectionTitle}>재료</Text>
      {detail.ingredients?.length ? detail.ingredients.map((ingredient, index) => <View key={`${ingredient.name}:${index}`} style={s.ingredient}><Text style={s.body}>{ingredient.name}</Text><Text style={s.muted}>{ingredient.amount_g == null ? '분량 정보 없음' : `${formatNumber(ingredient.amount_g)}g`}</Text></View>) : detail.ingredients_text ? <Text style={s.body}>{detail.ingredients_text}</Text> : <Text style={s.muted}>재료 정보가 제공되지 않았어요.</Text>}
      <Text style={s.sectionTitle}>만드는 순서</Text>
      {steps.length ? steps.map((step) => <View key={step.order} style={s.step}><Text style={s.stepIndex}>{step.order}</Text><View style={s.stepCopy}><Text style={s.body}>{step.instruction}</Text>{step.duration_minutes != null && <Text style={s.muted}>{formatNumber(step.duration_minutes)}분</Text>}{Boolean(step.tip) && <Text style={s.muted}>{step.tip}</Text>}</View></View>) : <Text style={s.muted}>조리 순서가 제공되지 않았어요.</Text>}
      {Boolean(detail.cooking_tip) && <Text style={s.tip}>조리 팁 · {detail.cooking_tip}</Text>}
      {Boolean(detail.source) && <Text style={s.muted}>출처: {detail.source}</Text>}
    </>}
  </View>;
}

export default function WeeklyRecipeScreen() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ planId?: string; day?: string; mealType?: string }>();
  const planId = typeof params.planId === 'string' ? params.planId : '';
  const day = days.find((value) => value === params.day);
  const mealType = meals.find((value) => value === params.mealType);
  const [servings, setServings] = useState(1);
  const [data, setData] = useState<WeeklyRecipe | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [requestServings, setRequestServings] = useState(1);
  const requestKey = `${planId}:${day}:${mealType}:${requestServings}:${retry}`;
  const loading = loadedKey !== requestKey;

  // Each request can call the AI, so wait until the +/− presses stop.
  useEffect(() => {
    const timer = setTimeout(() => setRequestServings(servings), 600);
    return () => clearTimeout(timer);
  }, [servings]);

  useEffect(() => {
    if (!planId || !day || !mealType) return;
    let active = true;
    void getWeeklyDietRecipe(planId, day, mealType, requestServings).then((result) => {
      if (active) { setData(result); setError(''); }
    }).catch((cause: unknown) => {
      if (active) { setData(null); setError(getDietApiErrorMessage(cause)); }
    }).finally(() => { if (active) setLoadedKey(requestKey); });
    return () => { active = false; };
  }, [planId, day, mealType, requestServings, requestKey]);

  const meal = data?.meal;
  return <View style={s.root}><ScreenHeader onBack={() => router.back()} title="주간 식단 레시피" />
  <ScrollView contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: insets.bottom + 40 }]}>
    {!planId || !day || !mealType ? <Text style={s.muted}>주간 식단에서 레시피를 다시 열어 주세요.</Text> : loading ? <View style={s.loading}><ALoading label="조리법을 찾는 중"><Text style={s.muted}>음식별 조리법을 찾고 있어요. 시간이 꽤 걸릴 수 있어요.</Text></ALoading></View> : error ? <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={s.source}>다시 시도</Text></Pressable></View> : meal ? <>
      <Text style={s.source}>{dayNames[day]}요일 · {mealNames[mealType]}</Text>
      <Text style={s.title}>{plainFoodName(meal.menu_name || '추천 메뉴')}</Text>
      {Boolean(meal.menu_description) && <Text style={s.body}>{meal.menu_description}</Text>}
      <View style={s.tags}>{meal.tags.map((tag, index) => <Text key={`${tag}:${index}`} style={s.tag}>{tag}</Text>)}</View>
      <View style={s.meta}><Text style={s.body}>{Math.round(meal.estimated_calories_kcal)} kcal</Text><Text style={s.body}>{meal.estimated_duration_minutes == null ? '조리시간 정보 없음' : `약 ${formatNumber(meal.estimated_duration_minutes)}분`}</Text></View>
      <View style={s.servings}><Text style={s.sectionTitle}>인분</Text><Pressable accessibilityRole="button" accessibilityLabel="인분 줄이기" disabled={servings <= 1} onPress={() => setServings((value) => value - 1)} style={[s.servingButton, servings <= 1 && s.off]}><MinusIcon color={colors.ink} height={16} width={16} /></Pressable><Text style={s.body}>{servings}인분</Text><Pressable accessibilityRole="button" accessibilityLabel="인분 늘리기" disabled={servings >= 20} onPress={() => setServings((value) => value + 1)} style={[s.servingButton, servings >= 20 && s.off]}><PlusIcon color={colors.ink} height={16} width={16} /></Pressable></View>
      <View style={s.card}><Text style={s.sectionTitle}>영양 정보</Text><Text style={s.body}>탄수화물 {formatNumber(meal.nutrition.carbohydrate_g)}g · 단백질 {formatNumber(meal.nutrition.protein_g)}g · 지방 {formatNumber(meal.nutrition.fat_g)}g</Text>{meal.daily_target_percentages && <Text style={s.muted}>일일 목표 대비 열량 {formatNumber(meal.daily_target_percentages.calories_percent)}% · 탄수화물 {formatNumber(meal.daily_target_percentages.carbohydrate_percent)}% · 단백질 {formatNumber(meal.daily_target_percentages.protein_percent)}% · 지방 {formatNumber(meal.daily_target_percentages.fat_percent)}%</Text>}</View>
      {meal.personalization_reasons.length > 0 && <View style={s.card}><Text style={s.sectionTitle}>추천 이유</Text>{meal.personalization_reasons.map((reason, index) => <Text key={index} style={s.body}>· {reason}</Text>)}</View>}
      {meal.allergen_notice.length > 0 && <View style={s.notice}><Text style={s.sectionTitle}>알레르기 안내</Text>{meal.allergen_notice.map((notice, index) => <Text key={index} style={s.body}>· {notice}</Text>)}</View>}
      <Text style={s.sectionTitle}>음식별 레시피</Text>
      {meal.items.map((item, index) => <RecipeItemCard key={`${item.food_name}:${index}`} item={item} />)}
      {meal.related_menus.length > 0 && <><Text style={s.sectionTitle}>관련 메뉴</Text>{meal.related_menus.map((related, index) => {
        const canOpen = related.day != null && related.meal_type != null;
        return <Pressable key={`${related.menu_name}:${index}`} accessibilityRole={canOpen ? 'button' : undefined} disabled={!canOpen} onPress={() => { if (related.day && related.meal_type) { setServings(1); router.replace({ pathname: '/diet/weekly-recipe', params: { planId, day: related.day, mealType: related.meal_type } }); } }} style={s.related}><Text style={s.body}>{plainFoodName(related.menu_name)}</Text><Text style={s.muted}>{related.day && related.meal_type ? `${dayNames[related.day]}요일 ${mealNames[related.meal_type]}` : ''}{related.estimated_calories_kcal == null ? '' : ` · ${formatNumber(related.estimated_calories_kcal)} kcal`}</Text></Pressable>;
      })}</>}
    </> : null}
  </ScrollView></View>;
}

function createSStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const tag = { ...a.p12, borderColor: colors.ink, borderRadius: 8, borderWidth: 2, color: colors.ink, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2 } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16 },
    loading: { height: 460 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 30 },
    body: { ...a.p15, color: colors.ink },
    muted: { ...a.p12, color: colors.textBody },
    source: a.note,
    sectionTitle: { ...a.p15, color: colors.ink, marginTop: 4 },
    itemTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    recipeName: { ...a.p15, color: colors.ink },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag,
    meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    servings: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    servingButton: { ...a.mini, paddingHorizontal: 0, width: 32 },
    off: { opacity: 0.35 },
    card: { ...a.card, gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
    notice: { backgroundColor: colors.warningLight, borderColor: colors.ink, borderRadius: 14, borderWidth: 2, gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
    // a clash with what I cannot eat: dark letters on the soft ground, not red
    warning: { ...a.p12, alignSelf: 'flex-start', backgroundColor: colors.warningLight, borderColor: colors.ink, borderRadius: 8, borderWidth: 2, color: colors.ink, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2 },
    ingredient: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    step: { flexDirection: 'row', gap: 12 },
    stepIndex: { ...a.p12, backgroundColor: colors.primary, borderColor: colors.ink, borderRadius: 9, borderWidth: 2, color: colors.onPrimary, height: 28, lineHeight: 24, overflow: 'hidden', textAlign: 'center', width: 28 },
    stepCopy: { flex: 1, gap: 4 },
    tip: { ...a.p12, backgroundColor: colors.surfaceMuted, borderRadius: 10, color: colors.ink, overflow: 'hidden', padding: 10 },
    related: { ...a.card, gap: 3, paddingHorizontal: 14, paddingVertical: 12 },
    error: { ...a.card, gap: 10, padding: 14 },
    errorText: { ...a.p15, color: colors.ink },
  } as const;
}
