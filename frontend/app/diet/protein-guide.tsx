import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { getDietApiErrorMessage, getDietNutritionSummary, getDietRecommendationsByDate } from '@/src/api/diet';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

type Data = Record<string, unknown>;
type Food = { name: string; protein: number | null; meal: string; amount: string };
const labels: Record<string, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };
const record = (value: unknown): Data | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const format = (value: number | null) => value == null ? '—' : Math.round(value) + 'g';

function readFoods(result: unknown): Food[] {
  const root = record(result);
  const meals = root?.meals ?? record(root?.recommendation)?.meals;
  if (!Array.isArray(meals)) return [];
  return meals.flatMap((value) => {
    const meal = record(value);
    const items = meal?.foods ?? meal?.items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((raw) => {
      const food = record(raw);
      const name = food ? string(food.food_name) || string(food.name) : string(raw);
      if (!name) return [];
      return [{ name, protein: nutritionNumber(food?.protein), meal: labels[string(meal?.meal_type)] ?? '추천', amount: food?.quantity == null ? '' : String(food.quantity) + string(food.unit) }];
    });
  });
}

function Accordion(props: { title: string; subtitle: string; expanded: boolean; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  return <View style={s.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: props.expanded }} accessibilityLabel={props.title + (props.expanded ? ' 접기' : ' 펼치기')} onPress={props.onPress} style={s.row}>
      <View style={s.flex}><Text style={s.cardTitle}>{props.title}</Text><Text style={s.secondary}>{props.subtitle}</Text></View>{props.expanded ? <MinusIcon color={colors.textPrimary} height={22} width={22} /> : <PlusIcon color={colors.textPrimary} height={22} width={22} />}
    </Pressable>
    {props.expanded && <View style={s.accordionBody}>{props.children}</View>}
  </View>;
}

export default function ProteinGuide() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' ? params.date : '';
  const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(date);
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const requestKey = date + ':' + retry;
  const [loadedKey, setLoadedKey] = useState('');
  const loading = loadedKey !== requestKey;
  const [open, setOpen] = useState<'portions' | 'swaps' | 'dining' | null>(null);

  useEffect(() => {
    if (invalid) return;
    let active = true;
    void Promise.allSettled([getDietNutritionSummary(date), getDietRecommendationsByDate(date)])
      .then(([nutrition, recommendations]) => {
        if (!active) return;
        if (nutrition.status === 'rejected') throw nutrition.reason;
        setSummary(nutrition.value.summary);
        setFoods(recommendations.status === 'fulfilled' ? readFoods(recommendations.value.result) : []);
        setError('');
      })
      .catch((cause) => { if (active) setError(getDietApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoadedKey(requestKey); });
    return () => { active = false; };
  }, [date, invalid, requestKey]);

  const consumed = nutritionNumber(summary?.protein.consumed);
  const target = nutritionNumber(summary?.protein.target);
  const percent = consumed != null && target != null && target > 0 ? Math.max(0, Math.min(100, Math.round(consumed / target * 100))) : 0;
  const perMeal = target == null ? null : Math.round(target / 3);
  const foodOptions = foods.filter((food) => food.protein != null && food.protein > 0).sort((a, b) => (b.protein ?? 0) - (a.protein ?? 0)).slice(0, 6);
  const mealTotals = (['아침', '점심', '저녁'] as const).flatMap((meal) => {
    const items = foods.filter((food) => food.meal === meal);
    return items.length && items.every((food) => food.protein != null)
      ? [{ meal, protein: items.reduce((sum, food) => sum + (food.protein ?? 0), 0) }] : [];
  });
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/diet');

  return <View style={s.root}>
    <ScreenHeader onBack={back} right={<SimpleReadButton text={'단백질 가이드. 이 날짜의 목표 ' + format(target) + ', 먹은 양 ' + format(consumed) + '.'} />} title="단백질 가이드" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
      {invalid ? <Text style={s.secondary}>식단에서 단백질 가이드를 다시 열어 주세요.</Text> : loading ? <ActivityIndicator color={colors.primaryText} style={s.loading} /> : error ? <View style={s.card}><Text style={s.secondary}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={s.link}>다시 시도</Text></Pressable></View> : <>
        <View style={s.card}><Text style={s.caption}>이 날짜의 단백질 목표</Text><View style={s.targetRow}><Text style={s.target}>{format(target)}</Text>{perMeal != null && <Text style={s.targetHint}>세 끼로 나누면 한 끼 약 {perMeal}g</Text>}</View><Text style={s.body}>{target == null ? '이 날짜의 목표가 아직 설정되지 않았어요.' : '식단에 설정된 하루 목표를 표시해요.'}</Text></View>

        <View style={s.card}><View style={s.row}><Text style={s.sectionTitle}>먹은 단백질</Text><Text style={s.current}>{format(consumed)} <Text style={s.currentTarget}>/ {format(target)}</Text></Text></View><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={s.track}><View style={[s.fill, { width: `${percent}%` }]} /></View>{mealTotals.length > 0 && <View style={s.chips}>{mealTotals.map((item) => <Text key={item.meal} style={s.chip}>{item.meal} 추천 {Math.round(item.protein)}g</Text>)}</View>}{summary?.has_unknown_items && <Text style={s.secondary}>영양 정보가 없는 기록은 합계에서 제외됐어요.</Text>}</View>

        <Accordion title="한 끼, 이렇게 채워요" subtitle="추천 식단에 포함된 단백질 식품" expanded={open === 'portions'} onPress={() => setOpen(open === 'portions' ? null : 'portions')}>
          {foodOptions.length ? foodOptions.map((food, index) => <View key={food.name + index} style={[s.foodRow, index > 0 && s.divider]}><View style={s.flex}><Text style={s.foodName}>{food.name}</Text><Text style={s.secondary}>{food.amount ? food.amount + ' · ' : ''}{food.meal}</Text></View><Text style={s.foodProtein}>약 {format(food.protein)}</Text></View>) : <Text style={s.secondary}>이 날짜의 추천 음식에 단백질 정보가 없어요.</Text>}
        </Accordion>

        <Accordion title="질릴 때 바꿔 먹기" subtitle="추천 메뉴가 맞지 않을 때 참고해요" expanded={open === 'swaps'} onPress={() => setOpen(open === 'swaps' ? null : 'swaps')}>
          <View style={s.tipRow}><Text style={s.tipLabel}>식품 바꾸기</Text><Text style={s.tipText}>닭가슴살 대신 생선, 두부, 달걀 등 선호하는 단백질 식품을 골라 보세요.</Text></View>
          <View style={[s.tipRow, s.divider]}><Text style={s.tipLabel}>양 확인하기</Text><Text style={s.tipText}>식품마다 단백질 양이 달라요. 제품 성분표를 확인해 주세요.</Text></View>
        </Accordion>

        <Accordion title="외식할 때" subtitle="백반 · 분식 · 고깃집에서 고르는 법" expanded={open === 'dining'} onPress={() => setOpen(open === 'dining' ? null : 'dining')}>
          <View style={s.tipRow}><Text style={s.tipLabel}>백반</Text><Text style={s.tipText}>생선, 달걀, 두부가 포함된 메뉴를 살펴보세요.</Text></View>
          <View style={[s.tipRow, s.divider]}><Text style={s.tipLabel}>분식</Text><Text style={s.tipText}>달걀이나 참치가 들어간 메뉴를 고르고 국물 섭취량을 조절해 보세요.</Text></View>
          <View style={[s.tipRow, s.divider]}><Text style={s.tipLabel}>고깃집</Text><Text style={s.tipText}>살코기와 채소를 함께 고르고 드신 양을 기록해 보세요.</Text></View>
        </Accordion>

        <View style={s.notice}><WarningIcon color={colors.warning} height={20} width={20} /><Text style={s.noticeText}>알레르기가 있는 식품은 피하고, 가공식품은 성분표를 확인해 주세요.</Text></View>
        <Text style={s.source}>목표는 식단 데이터, 먹은 양은 식사 기록 기준이에요. 음식별 영양 성분은 등록된 값과 실제 제품이 다를 수 있어요.</Text>
        <Pressable accessibilityRole="button" onPress={back} style={s.button}><Text style={s.buttonText}>저녁 식단 확인하기</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, gap: 16 }, loading: { marginTop: 32 },
    header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, backHit: { width: 44, height: 44, justifyContent: 'center' }, back: { color: colors.textPrimary, fontSize: 34, lineHeight: 38 }, headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', color: colors.textPrimary, fontSize: 18, fontFamily: fontFamilies.pretendardBold },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }, caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 19 }, body: { color: colors.textBody, fontSize: 14, lineHeight: 22 }, secondary: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 }, targetRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }, target: { color: colors.textPrimary, fontSize: 32, fontFamily: fontFamilies.pretendardBold }, targetHint: { color: colors.textSecondary, fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, flex: { flex: 1 }, sectionTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: fontFamilies.pretendardBold }, current: { color: colors.textPrimary, fontSize: 18, fontFamily: fontFamilies.pretendardBold }, currentTarget: { color: colors.textSecondary, fontSize: 14, fontFamily: fontFamilies.pretendardRegular }, track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.gaugeTrack }, fill: { height: 8, backgroundColor: colors.primary }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, color: colors.textBody, fontSize: 12 },
    cardTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold }, circleButton: { width: 28, height: 28, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, circleText: { fontSize: 21, lineHeight: 23, color: colors.textPrimary }, accordionBody: { gap: 5, paddingTop: 12 }, foodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }, foodName: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold }, foodProtein: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold }, divider: { borderTopWidth: 1, borderTopColor: colors.border }, tipRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 }, tipLabel: { backgroundColor: colors.surfaceMuted, borderRadius: 5, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, color: colors.textBody, fontSize: 12 }, tipText: { flex: 1, color: colors.textBody, fontSize: 14, lineHeight: 21 },
    notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.warningLight, borderRadius: 12, padding: 14 }, noticeIcon: { color: colors.warning, fontSize: 18 }, noticeText: { flex: 1, color: colors.textBody, fontSize: 14, lineHeight: 19 }, source: { color: colors.textSecondary, fontSize: 12, lineHeight: 19 }, link: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold }, button: { minHeight: 56, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, buttonText: { color: '#FFFFFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  } as const;
}
