import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusBar } from 'expo-status-bar';
import { getDietApiErrorMessage, getDietMealRecipe, getDietRecommendationsByDate, submitDietMealFeedback, type DietRecipeSnapshot } from '@/src/api/diet';
import { awardTierActivity } from '@/src/api/tier';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { fontFamilies } from '@/src/theme';

type Data = Record<string, unknown>;
type Food = { name: string; amount: string; carbohydrates: number | null; protein: number | null; fat: number | null };
type Ingredient = { name: string; amount: string };
type Step = { title: string; detail: string; minutes: number | null };

const record = (value: unknown): Data | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown): number | null => {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const measure = (value: unknown, unit: unknown) => value == null ? '' : String(value) + string(unit);

function mealsFrom(result: unknown): Data[] {
  const root = record(result);
  const meals = root?.meals ?? record(root?.recommendation)?.meals;
  return Array.isArray(meals) ? meals.map(record).filter((item): item is Data => item !== null) : [];
}

function readFoods(meal: Data | null): Food[] {
  const items = meal?.foods ?? meal?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((value) => {
    const item = record(value);
    const name = item ? string(item.food_name) || string(item.name) : string(value);
    return name ? [{ name, amount: item ? measure(item.quantity ?? item.amount, item.unit) : '', carbohydrates: number(item?.carbohydrates), protein: number(item?.protein), fat: number(item?.fat) }] : [];
  });
}

function readIngredients(recipe: DietRecipeSnapshot | null, foods: Food[]): Ingredient[] {
  if (!Array.isArray(recipe?.ingredients) || !recipe.ingredients.length) return foods.map(({ name, amount }) => ({ name, amount }));
  return recipe.ingredients.flatMap((value) => {
    const item = record(value);
    const name = item ? string(item.name) || string(item.food_name) || string(item.ingredient) : string(value);
    const amount = !item ? '' : item.amount_g != null ? measure(item.amount_g, 'g') : measure(item.quantity ?? item.amount, item.unit);
    return name ? [{ name, amount }] : [];
  });
}

function readSteps(recipe: DietRecipeSnapshot | null): Step[] {
  if (!Array.isArray(recipe?.steps)) return [];
  return recipe.steps.flatMap((value) => {
    const item = record(value);
    const title = item ? string(item.instruction) || string(item.description) || string(item.text) : string(value);
    return title ? [{ title, detail: item ? string(item.tip) || string(item.note) : '', minutes: number(item?.minutes ?? item?.duration_minutes) }] : [];
  });
}

function Accordion(props: { title: string; subtitle: string; expanded: boolean; onPress: () => void; children: React.ReactNode }) {
  return <View style={s.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: props.expanded }} accessibilityLabel={props.title + (props.expanded ? ' 접기' : ' 펼치기')} onPress={props.onPress} style={s.accordionHead}>
      <View style={s.accordionCopy}><Text style={s.cardTitle}>{props.title}</Text><Text style={s.secondary}>{props.subtitle}</Text></View>
      <View style={s.circleButton}><Text style={s.circleText}>{props.expanded ? '−' : '+'}</Text></View>
    </Pressable>
    {props.expanded && <View style={s.accordionBody}>{props.children}</View>}
  </View>;
}

export default function RecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; mealId?: string }>();
  const date = typeof params.date === 'string' ? params.date : '';
  const mealId = typeof params.mealId === 'string' ? params.mealId : '';
  const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(date) || !mealId;
  const [recipe, setRecipe] = useState<DietRecipeSnapshot | null>(null);
  const [meal, setMeal] = useState<Data | null>(null);
  const [otherMeals, setOtherMeals] = useState<Data[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const requestKey = date + ':' + mealId + ':' + retry;
  const [loadedKey, setLoadedKey] = useState('');
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [shoppingSavedKey, setShoppingSavedKey] = useState('');
  const [shoppingOpenKey, setShoppingOpenKey] = useState('');
  const [savingMeal, setSavingMeal] = useState(false);
  const [eatenMealId, setEatenMealId] = useState('');
  const shoppingKey = date + ':' + mealId;
  const shoppingSaved = shoppingSavedKey === shoppingKey;
  const shoppingOpen = shoppingOpenKey === shoppingKey;
  const mealEaten = eatenMealId === mealId;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    if (invalid) return;
    let active = true;
    void Promise.allSettled([getDietRecommendationsByDate(date), getDietMealRecipe(mealId)])
      .then(([recommendations, snapshot]) => {
        if (!active) return;
        if (recommendations.status === 'rejected') throw recommendations.reason;
        const meals = mealsFrom(recommendations.value.result);
        const found = meals.find((item) => item.diet_meal_id === mealId || item.id === mealId);
        if (!found) throw new Error('선택한 식단을 찾을 수 없어요. 식단을 다시 확인해 주세요.');
        setMeal(found);
        setOtherMeals(meals.filter((item) => item !== found));
        setRecipe(snapshot.status === 'fulfilled' ? snapshot.value.recipe : null);
        setError('');
      })
      .catch((cause) => { if (active) setError(getDietApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoadedKey(requestKey); });
    return () => { active = false; };
  }, [date, mealId, retry, invalid, requestKey]);

  useEffect(() => {
    if (invalid) return;
    let active = true;
    void AsyncStorage.getItem('recipe-shopping:' + shoppingKey).then((value) => { if (active) setShoppingSavedKey(value ? shoppingKey : ''); }).catch(() => undefined);
    return () => { active = false; };
  }, [shoppingKey, invalid]);

  const foods = useMemo(() => readFoods(meal), [meal]);
  const ingredients = useMemo(() => readIngredients(recipe, foods), [recipe, foods]);
  const steps = useMemo(() => readSteps(recipe), [recipe]);
  const total = (key: 'carbohydrates' | 'protein' | 'fat') => foods.length && foods.every((food) => food[key] != null)
    ? foods.reduce((sum, food) => sum + (food[key] ?? 0), 0) : null;
  const carbs = total('carbohydrates');
  const protein = total('protein');
  const fat = total('fat');
  const kcal = number(meal?.recommended_calories ?? meal?.calories);
  const title = string(recipe?.title) || (foods.length === 1 ? foods[0].name : '추천 식단 레시피');
  const prep = number(recipe?.prep_minutes);
  const servings = number(recipe?.servings);
  const note = string(meal?.recommendation_note);
  const description = string(recipe?.description) || note || (foods.length ? foods.map((food) => food.name).join(' · ') + '로 구성한 메뉴예요.' : '오늘의 추천 메뉴예요.');
  const today = new Date();
  const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const canRecord = date === todayKey;
  const otherTitles = otherMeals.map((item) => ({ id: string(item.diet_meal_id), title: string(item.menu_name) || string(item.title) || readFoods(item).map((food) => food.name).join(' · ') })).filter((item) => item.id && item.title).slice(0, 3);
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/diet');

  const saveShopping = async () => {
    try {
      if (!shoppingSaved) await AsyncStorage.setItem('recipe-shopping:' + shoppingKey, JSON.stringify({ title, ingredients }));
      setShoppingSavedKey(shoppingKey);
      setShoppingOpenKey(shoppingKey);
    } catch { Alert.alert('장보기 목록을 저장하지 못했어요', '다시 시도해 주세요.'); }
  };

  const markEaten = async () => {
    if (savingMeal || mealEaten) return;
    setSavingMeal(true);
    try {
      const response = await submitDietMealFeedback(mealId, { feedbackType: 'eaten', eatenAt: new Date().toISOString() });
      const mealLog = record(record(response.result)?.meal_log);
      const mealLogId = string(mealLog?.meal_log_id) || string(mealLog?.id);
      if (mealLogId) void awardTierActivity('meal_log', mealLogId).catch(() => undefined);
      setEatenMealId(mealId);
      Alert.alert('식사를 기록했어요', '식단에서 먹은 양을 확인할 수 있어요.');
    } catch (cause) { Alert.alert('식사를 기록하지 못했어요', getDietApiErrorMessage(cause)); }
    finally { setSavingMeal(false); }
  };

  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 32 }]}>
      <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={back} style={s.backHit}><Text style={s.back}>‹</Text></Pressable><Text style={s.headerTitle}>레시피</Text><SimpleReadButton text={title + '. ' + description + '. 재료 ' + ingredients.length + '가지, 만드는 순서 ' + steps.length + '단계.'} /></View>
      {invalid ? <Text style={s.secondary}>식단에서 레시피를 다시 열어 주세요.</Text> : loading ? <View style={s.loading}><ActivityIndicator color={purple} /><Text style={s.secondary}>레시피를 준비하고 있어요. 처음 열 때는 시간이 걸릴 수 있어요.</Text></View> : error ? <View style={s.card}><Text style={s.secondary}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={s.link}>다시 시도</Text></Pressable></View> : <>
        <View style={s.tags}><Text style={s.tag}>{string(meal?.meal_type) === 'dinner' ? '저녁' : string(meal?.meal_type) === 'breakfast' ? '아침' : string(meal?.meal_type) === 'lunch' ? '점심' : '간식'}</Text>{protein != null && <Text style={s.tag}>단백질 {Math.round(protein)}g</Text>}</View>
        <Text style={s.title}>{title}</Text>
        <View style={s.meta}><Text style={s.metaText}>◷  {prep == null ? '시간 정보 없음' : '약 ' + prep + '분'}</Text><Text style={s.metaText}>♨  {kcal == null ? '열량 정보 없음' : Math.round(kcal) + 'kcal'}</Text><Text style={s.metaText}>♙  {servings == null ? '1인분 기준' : servings + '인분'}</Text></View>
        <Text style={s.description}>{description}</Text>

        <Accordion title="1인분 영양" subtitle={([carbs == null ? null : '탄수화물 ' + Math.round(carbs) + 'g', protein == null ? null : '단백질 ' + Math.round(protein) + 'g', fat == null ? null : '지방 ' + Math.round(fat) + 'g'].filter(Boolean).join(' · ')) || '등록된 영양 정보가 없어요'} expanded={nutritionOpen} onPress={() => setNutritionOpen(!nutritionOpen)}>
          <View style={s.macroRow}>{([['탄수화물', carbs], ['단백질', protein], ['지방', fat]] as const).map(([label, value]) => <View key={label} style={s.macro}><Text style={s.secondary}>{label}</Text><Text style={s.macroValue}>{value == null ? '—' : Math.round(value) + 'g'}</Text></View>)}</View>
          <Text style={s.secondary}>추천 음식에 등록된 영양 성분을 합산했어요. 제품에 따라 실제 값이 달라질 수 있어요.</Text>
        </Accordion>

        <Accordion title="이 메뉴를 고른 이유" subtitle={note || '오늘 식단의 추천 음식으로 구성했어요'} expanded={reasonOpen} onPress={() => setReasonOpen(!reasonOpen)}>
          {note ? <Text style={s.description}>{note}</Text> : null}<Text style={s.secondary}>{protein == null ? '단백질 정보가 등록되지 않았어요.' : '이 메뉴의 단백질은 약 ' + Math.round(protein) + 'g이에요.'} 재료와 알레르기 정보는 드시기 전에 확인해 주세요.</Text>
        </Accordion>

        <View style={s.sectionHead}><Text style={s.sectionTitle}>재료 <Text style={s.count}>{ingredients.length}가지</Text></Text><Pressable accessibilityRole="button" onPress={() => void saveShopping()} style={s.outlineButton}><Text style={s.outlineText}>{shoppingSaved ? '장보기 목록 보기' : '장보기 목록에 담기'}</Text></Pressable></View>
        <View style={s.card}>{ingredients.length ? ingredients.map((ingredient, index) => <View key={ingredient.name + index} style={[s.ingredientRow, index > 0 && s.divider]}><Text style={s.ingredientName}>{ingredient.name}</Text><Text style={s.ingredientAmount}>{ingredient.amount}</Text></View>) : <Text style={s.secondary}>재료 정보가 등록되지 않았어요.</Text>}</View>
        {shoppingOpen && <View style={s.shoppingPanel}><View style={s.sectionHead}><Text style={s.cardTitle}>장보기 목록</Text><Pressable accessibilityRole="button" onPress={() => setShoppingOpenKey('')}><Text style={s.link}>닫기</Text></Pressable></View><Text style={s.secondary}>{ingredients.map((item) => item.name + (item.amount ? ' ' + item.amount : '')).join(' · ')}</Text></View>}
        <View style={s.notice}><Text style={s.noticeIcon}>ⓘ</Text><Text style={s.noticeText}>알레르기 성분은 재료와 제품에 따라 달라요. 먹기 전에 성분표를 꼭 확인해 주세요.</Text></View>

        <View style={s.sectionHead}><Text style={s.sectionTitle}>만드는 순서 <Text style={s.count}>{steps.length}단계{prep == null ? '' : ' · ' + prep + '분'}</Text></Text></View>
        <View style={s.card}>{steps.length ? steps.map((step, index) => <View key={index} style={[s.stepRow, index > 0 && s.divider]}><View style={s.stepCircle}><Text style={s.stepNumber}>{index + 1}</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>{step.title}</Text>{step.detail ? <Text style={s.secondary}>{step.detail}</Text> : null}{step.minutes != null && <Text style={s.secondary}>◷ {step.minutes}분</Text>}</View></View>) : <Text style={s.secondary}>이 메뉴의 조리 순서는 아직 등록되지 않았어요. 재료와 분량을 참고해 주세요.</Text>}</View>

        {otherTitles.length > 0 && <><Text style={s.sectionTitle}>오늘 식단의 다른 레시피</Text><View style={s.otherMeals}>{otherTitles.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.replace({ pathname: '/diet/recipe', params: { date, mealId: item.id } })} style={s.otherChip}><Text style={s.otherText}>{item.title}</Text></Pressable>)}</View></>}
        <Pressable accessibilityRole="button" disabled={savingMeal || mealEaten || !canRecord} onPress={() => void markEaten()} style={[s.primaryButton, (savingMeal || mealEaten || !canRecord) && s.disabled]}><Text style={s.primaryText}>{!canRecord ? '오늘 메뉴만 기록할 수 있어요' : mealEaten ? '먹은 메뉴로 기록했어요' : savingMeal ? '기록 중…' : '이 메뉴 먹었어요'}</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

const purple = '#503DE1';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingHorizontal: 20, gap: 16 }, loading: { alignItems: 'center', gap: 10, marginTop: 32 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, backHit: { width: 44, height: 44, justifyContent: 'center' }, back: { color: '#1B1B22', fontSize: 34, lineHeight: 38 }, headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', color: '#1B1B22', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, tag: { overflow: 'hidden', backgroundColor: '#F2F3F5', color: '#60616B', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, fontSize: 12 },
  title: { color: '#1B1B22', fontSize: 25, fontFamily: fontFamilies.pretendardBold }, meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, metaText: { color: '#555660', fontSize: 14 }, description: { color: '#454650', fontSize: 15, lineHeight: 24 },
  card: { backgroundColor: '#F8F9FA', borderColor: '#DDE1E6', borderWidth: 1, borderRadius: 16, padding: 16 }, cardTitle: { color: '#1B1B22', fontSize: 15, fontFamily: fontFamilies.pretendardBold }, secondary: { color: '#646670', fontSize: 13, lineHeight: 20 }, accordionHead: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 12 }, accordionCopy: { flex: 1, gap: 3 }, circleButton: { width: 28, height: 28, borderWidth: 1, borderColor: '#DDE1E6', backgroundColor: '#FFFFFF', borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, circleText: { fontSize: 21, lineHeight: 23, color: '#393A42' }, accordionBody: { gap: 12, paddingTop: 15 }, macroRow: { flexDirection: 'row', gap: 8 }, macro: { flex: 1, borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 12, padding: 10, gap: 6 }, macroValue: { color: '#1B1B22', fontSize: 17, fontFamily: fontFamilies.pretendardBold },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }, sectionTitle: { color: '#1B1B22', fontSize: 17, fontFamily: fontFamilies.pretendardBold }, count: { color: '#646670', fontFamily: fontFamilies.pretendardRegular, fontSize: 14 }, outlineButton: { borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 9, paddingHorizontal: 10, minHeight: 34, justifyContent: 'center' }, outlineText: { color: '#1B1B22', fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold }, ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 10 }, divider: { borderTopWidth: 1, borderTopColor: '#DDE1E6' }, ingredientName: { flex: 1, color: '#1B1B22', fontSize: 15 }, ingredientAmount: { color: '#454650', fontSize: 14 }, shoppingPanel: { padding: 14, gap: 8, borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 12 }, link: { color: purple, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FFF3DF', borderRadius: 12, padding: 14 }, noticeIcon: { color: '#A85B00', fontSize: 18 }, noticeText: { flex: 1, color: '#3D3D47', fontSize: 12, lineHeight: 18 }, stepRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 }, stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1B1B22', alignItems: 'center', justifyContent: 'center' }, stepNumber: { color: '#FFFFFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, stepCopy: { flex: 1, gap: 5 }, stepTitle: { color: '#1B1B22', fontSize: 14, lineHeight: 22 }, otherMeals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, otherChip: { borderWidth: 1, borderColor: '#DDE1E6', borderRadius: 25, paddingHorizontal: 13, paddingVertical: 9 }, otherText: { color: '#454650', fontSize: 13 }, primaryButton: { minHeight: 54, backgroundColor: purple, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, primaryText: { color: '#FFFFFF', fontSize: 17, fontFamily: fontFamilies.pretendardBold }, disabled: { opacity: 0.65 },
});
