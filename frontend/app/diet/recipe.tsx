import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getDietApiErrorMessage,
  getDietMealRecipe,
  getDietRecommendationsByDate,
  type DietRecipeSnapshot,
} from '@/src/api/diet';
import { fontFamilies } from '@/src/theme';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';

type RecordValue = Record<string, unknown>;
type RecommendedFood = { name: string; amount: string; protein: number | null };

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ingredientLine(value: unknown): { name: string; detail: string } | null {
  if (typeof value === 'string' && value.trim()) return { name: value.trim(), detail: '' };
  const item = asRecord(value);
  if (!item) return null;
  const name = asText(item.name) || asText(item.food_name) || asText(item.ingredient);
  if (!name) return null;
  const quantity = item.quantity ?? item.amount;
  const detail = [quantity == null ? '' : String(quantity), asText(item.unit)].filter(Boolean).join('');
  return { name, detail };
}

function stepLine(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const item = asRecord(value);
  return item ? asText(item.instruction) || asText(item.description) || asText(item.text) : '';
}

function findMeal(result: unknown, mealId: string): RecordValue | null {
  const root = asRecord(result);
  const meals = root?.meals ?? asRecord(root?.recommendation)?.meals;
  return Array.isArray(meals)
    ? (meals.map(asRecord).find((meal) => meal && (meal.diet_meal_id === mealId || meal.id === mealId)) ?? null)
    : null;
}

function recommendedFoods(meal: RecordValue | null): RecommendedFood[] {
  const items = meal?.foods ?? meal?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((value) => {
    const item = asRecord(value);
    const name = typeof value === 'string' ? value.trim() : item ? asText(item.food_name) || asText(item.name) : '';
    if (!name) return [];
    const amount = item && item.quantity != null ? `${item.quantity}${asText(item.unit)}` : '';
    return [{ name, amount, protein: item ? asNumber(item.protein) : null }];
  });
}

export default function RecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const params = useLocalSearchParams<{ date?: string; mealId?: string }>();
  const date = typeof params.date === 'string' ? params.date : '';
  const mealId = typeof params.mealId === 'string' ? params.mealId : '';
  const [recipe, setRecipe] = useState<DietRecipeSnapshot | null>(null);
  const [meal, setMeal] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);
  const invalidParams = !/^\d{4}-\d{2}-\d{2}$/.test(date) || !mealId;

  useEffect(() => {
    let active = true;
    if (invalidParams) return;
    void Promise.allSettled([getDietRecommendationsByDate(date), getDietMealRecipe(mealId)])
      .then(([recommendation, snapshot]) => {
        if (!active) return;
        if (recommendation.status === 'rejected') throw recommendation.reason;
        const currentMeal = findMeal(recommendation.value.result, mealId);
        if (!currentMeal) {
          setError('선택한 식단을 찾을 수 없어요. 식단을 다시 확인해 주세요.');
          setRecipe(null);
          setMeal(null);
        } else {
          setMeal(currentMeal);
          setRecipe(snapshot.status === 'fulfilled' ? snapshot.value.recipe : null);
          setError('');
        }
      })
      .catch((cause) => { if (active) setError(getDietApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, mealId, retry, invalidParams]);

  const foods = recommendedFoods(meal);
  const ingredients = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.map(ingredientLine).filter((item): item is { name: string; detail: string } => Boolean(item))
    : [];
  const steps = Array.isArray(recipe?.steps) ? recipe.steps.map(stepLine).filter(Boolean) : [];
  const kcal = asNumber(meal?.recommended_calories ?? meal?.calories);
  const title = recipe?.title?.trim() || (foods.length === 1 ? foods[0].name : '추천 식단 레시피');

  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/diet');
  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, simple && simpleStyles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={back}><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.headerTitle}>레시피</Text><SimpleReadButton text={`${title} 레시피입니다. ${recipe?.description ?? ''} 재료 ${ingredients.length}가지, 만드는 순서 ${steps.length}단계입니다. 알레르기 성분은 먹기 전에 제품 표시를 확인해 주세요.`} />
      </View>
      {invalidParams ? <View style={s.card}><Text style={s.body}>식단에서 레시피를 다시 열어 주세요.</Text></View> : loading ? <ActivityIndicator color={purple} style={{ marginTop: 32 }} /> : error ? (
        <View style={s.card}><Text style={s.body}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }}><Text style={s.link}>다시 시도</Text></Pressable></View>
      ) : <>
        <View style={s.tags}><Text style={s.tag}>{date}</Text>{recipe?.prep_minutes != null && <Text style={s.tag}>약 {recipe.prep_minutes}분</Text>}{recipe?.servings != null && <Text style={s.tag}>{recipe.servings}인분</Text>}</View>
        <Text style={[s.hero, simple && simpleStyles.hero]}>{title}</Text>
        <Text style={s.meta}>{kcal == null ? '열량 정보 없음' : `${Math.round(kcal)}kcal`}{recipe ? ' · 저장된 레시피' : ' · 추천 식단'}</Text>
        {recipe?.description ? <Text style={[s.body, simple && simpleStyles.body]}>{recipe.description}</Text> : null}
        {!recipe && <View style={s.notice}><Text style={s.noticeTitle}>조리법을 준비 중이에요</Text><Text style={s.body}>이 식단에는 저장된 레시피가 아직 없어요. 추천 음식 구성은 아래에서 확인할 수 있어요.</Text></View>}
        <View style={[s.card, simple && simpleStyles.card]}>
          <Text style={[s.sectionTitle, simple && simpleStyles.sectionTitle]}>{recipe ? `재료 ${ingredients.length}가지` : '추천 음식 구성'}</Text>
          {(recipe ? ingredients : foods).map((item, index) => <View key={`${item.name}-${index}`} style={s.listRow}><Text style={[s.listName, simple && simpleStyles.body]}>{item.name}</Text><Text style={[s.listDetail, simple && simpleStyles.body]}>{'detail' in item ? item.detail : item.amount}</Text></View>)}
          {(recipe ? ingredients : foods).length === 0 && <Text style={s.body}>표시할 음식 정보가 없어요.</Text>}
        </View>
        {recipe && <View style={[s.card, simple && simpleStyles.card]}>
          <Text style={[s.sectionTitle, simple && simpleStyles.sectionTitle]}>만드는 순서</Text>
          {steps.map((step, index) => <View key={index} style={s.stepRow}><View style={s.stepCircle}><Text style={s.stepNumber}>{index + 1}</Text></View><Text style={[s.stepText, simple && simpleStyles.body]}>{step}</Text></View>)}
          {steps.length === 0 && <Text style={s.body}>조리 단계가 등록되지 않았어요.</Text>}
        </View>}
        {recipe && <View style={[s.card, simple && simpleStyles.card]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={s.expandRow}>
            <Text style={s.sectionTitle}>식단 영양 정보</Text><Text style={s.expandIcon}>{expanded ? '−' : '+'}</Text>
          </Pressable>
          {expanded && <Text style={s.body}>{kcal == null ? '열량 정보가 없어요.' : `추천 끼니 열량 ${Math.round(kcal)}kcal`}{foods.some((food) => food.protein != null) ? ` · 음식별 단백질 ${foods.map((food) => food.protein ?? 0).reduce((sum, value) => sum + value, 0).toFixed(1)}g` : ''}</Text>}
        </View>}
        <View style={s.notice}><Text style={s.noticeTitle}>먹기 전에 확인해 주세요</Text><Text style={s.body}>알레르기와 재료 성분은 제품 표시를 직접 확인해 주세요.</Text></View>
        <Pressable accessibilityRole="button" onPress={back} style={[s.button, simple && simpleStyles.button]}><Text style={s.buttonText}>식단으로 돌아가기</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

const purple = '#503DE1';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingHorizontal: 20, gap: 18 },
  header: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { color: '#1B1B22', fontSize: 32, lineHeight: 36 }, headerTitle: { color: '#1B1B22', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }, tag: { backgroundColor: '#F2F3F5', color: '#565761', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, fontSize: 12 },
  hero: { color: '#1B1B22', fontSize: 27, fontFamily: fontFamilies.pretendardBold }, meta: { color: '#666772', fontSize: 14 }, body: { color: '#555660', fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: '#F8F9FA', borderColor: '#DDE1E6', borderWidth: 1, borderRadius: 17, padding: 18, gap: 12 }, sectionTitle: { color: '#1B1B22', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E1E4E8' }, listName: { color: '#202128', fontSize: 14, flex: 1 }, listDetail: { color: '#555660', fontSize: 14 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E1E4E8' }, stepCircle: { width: 26, height: 26, backgroundColor: '#202128', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, stepNumber: { color: '#FFFFFF', fontSize: 13 }, stepText: { flex: 1, color: '#202128', fontSize: 14, lineHeight: 22 },
  expandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, expandIcon: { color: '#303139', fontSize: 22 },
  notice: { backgroundColor: '#FFF3DF', borderRadius: 13, padding: 16, gap: 6 }, noticeTitle: { color: '#27232A', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, link: { color: purple, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
  button: { backgroundColor: purple, minHeight: 54, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 }, buttonText: { color: '#FFFFFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
});

const simpleStyles = StyleSheet.create({
  content: { gap: 22 },
  hero: { fontSize: 32 },
  card: { padding: 22 },
  sectionTitle: { fontSize: 20 },
  body: { fontSize: 17, lineHeight: 26 },
  button: { minHeight: 62 },
});
