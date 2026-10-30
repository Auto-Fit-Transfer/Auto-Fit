import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDietApiErrorMessage, getDietNutritionSummary, getDietRecommendationsByDate } from '@/src/api/diet';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';
import { fontFamilies } from '@/src/theme';

type Food = { name: string; protein: number | null; meal: string };

function readFoods(result: unknown): Food[] {
  if (!result || typeof result !== 'object') return [];
  const root = result as Record<string, unknown>;
  const meals = root.meals ?? (root.recommendation && typeof root.recommendation === 'object'
    ? (root.recommendation as Record<string, unknown>).meals : undefined);
  if (!Array.isArray(meals)) return [];
  const labels: Record<string, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };
  return meals.flatMap((meal) => {
    if (!meal || typeof meal !== 'object') return [];
    const record = meal as Record<string, unknown>;
    const foods = record.foods ?? record.items;
    if (!Array.isArray(foods)) return [];
    const mealType = typeof record.meal_type === 'string' ? record.meal_type : '';
    return foods.flatMap((food) => {
      if (!food || typeof food !== 'object') return [];
      const item = food as Record<string, unknown>;
      const name = typeof item.food_name === 'string' ? item.food_name : typeof item.name === 'string' ? item.name : '';
      if (!name.trim()) return [];
      return [{ name: name.trim(), protein: nutritionNumber(item.protein), meal: labels[mealType] ?? '추천' }];
    });
  });
}

export default function ProteinGuide() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' ? params.date : '';
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);
  const invalidParams = !/^\d{4}-\d{2}-\d{2}$/.test(date);

  useEffect(() => {
    let active = true;
    if (invalidParams) return;
    void Promise.allSettled([getDietNutritionSummary(date), getDietRecommendationsByDate(date)])
      .then(([nutrition, recommendation]) => {
        if (!active) return;
        if (nutrition.status === 'rejected') throw nutrition.reason;
        setSummary(nutrition.value.summary);
        setFoods(recommendation.status === 'fulfilled' ? readFoods(recommendation.value.result) : []);
        setError('');
      })
      .catch((cause) => { if (active) setError(getDietApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, retry, invalidParams]);

  const consumed = nutritionNumber(summary?.protein.consumed);
  const target = nutritionNumber(summary?.protein.target);
  const percent = consumed != null && target != null && target > 0
    ? Math.max(0, Math.min(100, Math.round(consumed / target * 100))) : 0;
  const format = (value: number | null) => value == null ? '—' : `${Math.round(value)}g`;
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/diet');

  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={back}><Text style={s.back}>‹</Text></Pressable><Text style={s.headerTitle}>단백질 가이드</Text><View style={{ width: 24 }} /></View>
      {invalidParams ? <View style={s.card}><Text style={s.body}>식단에서 단백질 가이드를 다시 열어 주세요.</Text></View> : loading ? <ActivityIndicator color={purple} style={{ marginTop: 32 }} /> : error ? (
        <View style={s.card}><Text style={s.body}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }}><Text style={s.link}>다시 시도</Text></Pressable></View>
      ) : <>
        <View style={s.card}>
          <Text style={s.caption}>{date} 단백질 목표</Text>
          <Text style={s.big}>{format(target)}</Text>
          <Text style={s.body}>{target == null ? '이 날짜의 단백질 목표가 아직 설정되지 않았어요.' : '식단에 설정된 하루 목표예요.'}</Text>
        </View>
        <View style={s.card}>
          <View style={s.row}><Text style={s.sectionTitle}>먹은 단백질</Text><Text style={s.value}>{format(consumed)} <Text style={s.muted}>/ {format(target)}</Text></Text></View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={s.track}><View style={[s.fill, { width: `${percent}%` }]} /></View>
          {summary?.has_unknown_items && <Text style={s.caption}>영양 정보가 없는 음식은 합계에서 제외됐어요.</Text>}
        </View>
        <View style={s.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={s.row}>
            <View style={{ flex: 1 }}><Text style={s.sectionTitle}>추천 식단의 단백질</Text><Text style={s.caption}>음식별 등록된 영양 정보를 확인해요.</Text></View><Text style={s.plus}>{expanded ? '−' : '+'}</Text>
          </Pressable>
          {expanded && (foods.length ? foods.map((food, index) => <View key={`${food.meal}-${food.name}-${index}`} style={s.foodRow}><View style={{ flex: 1 }}><Text style={s.foodName}>{food.name}</Text><Text style={s.caption}>{food.meal}</Text></View><Text style={s.value}>{format(food.protein)}</Text></View>) : <Text style={s.body}>이 날짜에 추천된 음식이 없어요.</Text>)}
        </View>
        <View style={s.notice}><Text style={s.sectionTitle}>식품을 선택할 때</Text><Text style={s.body}>알레르기 정보와 실제 영양 성분은 제품 표시를 확인해 주세요. 건강 상태에 따른 식사 조정이 필요하다면 전문가와 상의해 주세요.</Text></View>
        <Pressable accessibilityRole="button" onPress={back} style={s.button}><Text style={s.buttonText}>식단으로 돌아가기</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

const purple = '#503DE1';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingHorizontal: 20, gap: 18 },
  header: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { color: '#1B1B22', fontSize: 32, lineHeight: 36 }, headerTitle: { color: '#1B1B22', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  card: { backgroundColor: '#F8F9FA', borderColor: '#DDE1E6', borderWidth: 1, borderRadius: 17, padding: 18, gap: 12 }, caption: { color: '#646670', fontSize: 12, lineHeight: 18 }, big: { color: '#1B1B22', fontSize: 38, fontFamily: fontFamilies.pretendardBold }, body: { color: '#555660', fontSize: 14, lineHeight: 22 }, sectionTitle: { color: '#1B1B22', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, value: { color: '#1B1B22', fontSize: 17, fontFamily: fontFamilies.pretendardBold }, muted: { color: '#646670', fontSize: 13, fontFamily: fontFamilies.pretendardRegular },
  track: { height: 8, backgroundColor: '#E2E5E9', borderRadius: 5, overflow: 'hidden' }, fill: { height: 8, backgroundColor: purple, borderRadius: 5 },
  plus: { color: '#3B3C45', fontSize: 24 }, foodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E0E3E7', paddingVertical: 10 }, foodName: { color: '#25262D', fontSize: 14, marginBottom: 3 },
  notice: { backgroundColor: '#FFF3DF', borderRadius: 13, padding: 16, gap: 8 }, link: { color: purple, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold }, button: { backgroundColor: purple, minHeight: 54, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 }, buttonText: { color: '#FFFFFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
});
