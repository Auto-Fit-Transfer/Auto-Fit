import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDietApiErrorMessage, getWeeklyDietRecipe, type WeeklyDay, type WeeklyMealType, type WeeklyRecipe, type WeeklyRecipeItem } from '@/src/api/diet';
import { Text } from '@/src/components/common';
import { fontFamilies } from '@/src/theme';

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
  const detail = item.recipe_available ? item.recipe : null;
  const steps = detail?.step_details.length ? detail.step_details : detail?.steps.map((instruction, index) => ({ order: index + 1, instruction, duration_minutes: null, tip: null })) ?? [];
  return <View style={s.card}>
    <Text style={s.itemTitle}>{item.food_name}</Text>
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
  return <View style={s.root}><ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}>
    <View style={s.header}><Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="주간 식단으로 돌아가기" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><Text style={s.headerTitle}>주간 식단 레시피</Text></View>
    {!planId || !day || !mealType ? <Text style={s.muted}>주간 식단에서 레시피를 다시 열어 주세요.</Text> : loading ? <View style={s.loading}><ActivityIndicator color="#5246C6" /><Text style={s.muted}>음식별 조리법을 찾고 있어요. 시간이 꽤 걸릴 수 있어요.</Text></View> : error ? <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={s.source}>다시 시도</Text></Pressable></View> : meal ? <>
      <Text style={s.source}>{dayNames[day]}요일 · {mealNames[mealType]}</Text>
      <Text style={s.title}>{meal.menu_name || '추천 메뉴'}</Text>
      {Boolean(meal.menu_description) && <Text style={s.body}>{meal.menu_description}</Text>}
      <View style={s.tags}>{meal.tags.map((tag, index) => <Text key={`${tag}:${index}`} style={s.tag}>{tag}</Text>)}</View>
      <View style={s.meta}><Text style={s.body}>{Math.round(meal.estimated_calories_kcal)} kcal</Text><Text style={s.body}>{meal.estimated_duration_minutes == null ? '조리시간 정보 없음' : `약 ${formatNumber(meal.estimated_duration_minutes)}분`}</Text></View>
      <View style={s.servings}><Text style={s.sectionTitle}>인분</Text><Pressable accessibilityRole="button" accessibilityLabel="인분 줄이기" disabled={servings <= 1} onPress={() => setServings((value) => value - 1)} style={s.servingButton}><Text style={s.servingButtonText}>−</Text></Pressable><Text style={s.body}>{servings}인분</Text><Pressable accessibilityRole="button" accessibilityLabel="인분 늘리기" disabled={servings >= 20} onPress={() => setServings((value) => value + 1)} style={s.servingButton}><Text style={s.servingButtonText}>+</Text></Pressable></View>
      <View style={s.card}><Text style={s.sectionTitle}>영양 정보</Text><Text style={s.body}>탄수화물 {formatNumber(meal.nutrition.carbohydrate_g)}g · 단백질 {formatNumber(meal.nutrition.protein_g)}g · 지방 {formatNumber(meal.nutrition.fat_g)}g</Text>{meal.daily_target_percentages && <Text style={s.muted}>일일 목표 대비 열량 {formatNumber(meal.daily_target_percentages.calories_percent)}% · 탄수화물 {formatNumber(meal.daily_target_percentages.carbohydrate_percent)}% · 단백질 {formatNumber(meal.daily_target_percentages.protein_percent)}% · 지방 {formatNumber(meal.daily_target_percentages.fat_percent)}%</Text>}</View>
      {meal.personalization_reasons.length > 0 && <View style={s.card}><Text style={s.sectionTitle}>추천 이유</Text>{meal.personalization_reasons.map((reason, index) => <Text key={index} style={s.body}>· {reason}</Text>)}</View>}
      {meal.allergen_notice.length > 0 && <View style={s.notice}><Text style={s.sectionTitle}>알레르기 안내</Text>{meal.allergen_notice.map((notice, index) => <Text key={index} style={s.body}>· {notice}</Text>)}</View>}
      <Text style={s.sectionTitle}>음식별 레시피</Text>
      {meal.items.map((item, index) => <RecipeItemCard key={`${item.food_name}:${index}`} item={item} />)}
      {meal.related_menus.length > 0 && <><Text style={s.sectionTitle}>관련 메뉴</Text>{meal.related_menus.map((related, index) => {
        const canOpen = related.day != null && related.meal_type != null;
        return <Pressable key={`${related.menu_name}:${index}`} accessibilityRole={canOpen ? 'button' : undefined} disabled={!canOpen} onPress={() => { if (related.day && related.meal_type) { setServings(1); router.replace({ pathname: '/diet/weekly-recipe', params: { planId, day: related.day, mealType: related.meal_type } }); } }} style={s.related}><Text style={s.body}>{related.menu_name}</Text><Text style={s.muted}>{related.day && related.meal_type ? `${dayNames[related.day]}요일 ${mealNames[related.meal_type]}` : ''}{related.estimated_calories_kcal == null ? '' : ` · ${formatNumber(related.estimated_calories_kcal)} kcal`}</Text></Pressable>;
      })}</>}
    </> : null}
  </ScrollView></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingHorizontal: 20, gap: 14 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center' }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { fontSize: 34, color: '#1B1B22' }, headerTitle: { fontSize: 19, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, loading: { marginTop: 40, alignItems: 'center', gap: 12 },
  title: { fontSize: 24, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, body: { fontSize: 14, color: '#3D3D47', lineHeight: 22 }, muted: { fontSize: 13, color: '#646670', lineHeight: 20 }, source: { fontSize: 13, color: '#5246C6', fontFamily: fontFamilies.pretendardSemiBold }, sectionTitle: { fontSize: 16, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, itemTitle: { fontSize: 17, color: '#1B1B22', fontFamily: fontFamilies.pretendardBold }, recipeName: { fontSize: 15, color: '#1B1B22', fontFamily: fontFamilies.pretendardSemiBold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, tag: { backgroundColor: '#EDEFF2', color: '#454650', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, fontSize: 12 }, meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, servings: { flexDirection: 'row', alignItems: 'center', gap: 12 }, servingButton: { backgroundColor: '#FAFBFC', width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#DDE1E6', alignItems: 'center', justifyContent: 'center' }, servingButtonText: { fontSize: 20, color: '#5246C6' },
  card: { backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 12, padding: 15, gap: 10 }, notice: { backgroundColor: '#FFF3DF', borderRadius: 12, padding: 15, gap: 7 }, warning: { color: '#9A2525', fontSize: 13, lineHeight: 20 }, ingredient: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, step: { flexDirection: 'row', gap: 12 }, stepIndex: { backgroundColor: '#1B1B22', color: '#FFFFFF', borderRadius: 14, overflow: 'hidden', width: 28, height: 28, textAlign: 'center', lineHeight: 28 }, stepCopy: { flex: 1, gap: 4 }, tip: { fontSize: 13, lineHeight: 20, color: '#454650', backgroundColor: '#EDEFF2', padding: 10, borderRadius: 8 }, related: { backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 9, padding: 12, gap: 3 }, error: { padding: 14, backgroundColor: '#FFF1F1', borderRadius: 10, gap: 10 }, errorText: { color: '#9A2525', fontSize: 13 },
});
