import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { darkColors, fontFamilies } from '@/src/theme';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';

export type R6Meal = {
  id: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  kcal: number | null;
  foods: string;
  note: string;
  imageUrl?: string;
  status: 'recommended' | 'eaten' | 'modified' | 'skipped';
  canSave: boolean;
  pending: boolean;
  regenerating: boolean;
};

export type R6Goal = { label: string; current: number | null; target: number | null; unit: string };

type Props = {
  today: Date;
  selectedDateOffset: number;
  selectedDateKey: string;
  goals: R6Goal[];
  nutritionError: string | null;
  hasUnknownItems: boolean;
  meals: R6Meal[];
  mealsLoading: boolean;
  mealsError: string | null;
  onSelectDateOffset: (offset: number) => void;
  onRetryNutrition: () => void;
  onRetryMeals: () => void;
  onRecord: (mealId: R6Meal['id']) => void;
  onStatusChange: (mealId: R6Meal['id'], status: 'eaten' | 'skipped') => void;
  onAlternative: (mealId: R6Meal['id']) => void;
  onOpenRecipe: (mealId: R6Meal['id']) => void;
  onOpenProteinGuide: () => void;
  showRecordControls: boolean;
};

const mealLabels: { id: R6Meal['id']; title: string }[] = [
  { id: 'breakfast', title: '아침' },
  { id: 'lunch', title: '점심' },
  { id: 'dinner', title: '저녁' },
  { id: 'snack', title: '간식' },
];
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function dateAtOffset(today: Date, offset: number) {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date;
}

function ProgressLine({ value, target }: { value: number | null; target: number | null }) {
  const percent =
    value != null && target != null && target > 0
      ? Math.min(100, Math.max(0, Math.round((value / target) * 100)))
      : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
}

export function R6DietHome(props: Props) {
  const insets = useSafeAreaInsets();
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<R6Meal['id'] | null>(null);
  const canRecordPhoto = props.meals.some((meal) => meal.canSave);
  const selectedDate = dateAtOffset(props.today, props.selectedDateOffset);
  const week = useMemo(() => {
    const mondayOffset = props.selectedDateOffset - ((selectedDate.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => {
      const offset = mondayOffset + index;
      return { date: dateAtOffset(props.today, offset), offset };
    });
  }, [props.selectedDateOffset, props.today, selectedDate]);
  const energy = props.goals[0];
  const energyPercent =
    energy?.current != null && energy.target != null && energy.target > 0
      ? Math.round((energy.current / energy.target) * 100)
      : null;
  const number = (value: number | null | undefined) =>
    value == null ? '—' : Math.round(value).toLocaleString('ko-KR');

  return (
    <View style={[styles.root, isDark && dark.root]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 105 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, simple && simpleStyles.title, isDark && dark.text]}>식단</Text>
          <SimpleReadButton text={`${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 식단입니다. 먹은 양은 ${number(energy?.current)}킬로칼로리입니다. ${props.meals.length ? `식단 ${props.meals.length}개를 확인해 보세요.` : '등록된 식단이 없습니다.'}`} />
        </View>
        <View style={styles.monthRow}>
          <Text style={[styles.month, isDark && dark.text]}>
            {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월
          </Text>
          <Pressable accessibilityRole="button" onPress={() => props.onSelectDateOffset(0)}>
            <Text style={styles.today}>오늘</Text>
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {week.map(({ date, offset }) => (
            <Pressable
              key={offset}
              accessibilityRole="button"
              accessibilityState={{ selected: offset === props.selectedDateOffset }}
              disabled={offset < -6 || offset > 6}
              onPress={() => props.onSelectDateOffset(offset)}
              style={[
                styles.day,
                offset === props.selectedDateOffset && styles.selectedDay,
                (offset < -6 || offset > 6) && styles.disabledDay,
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  offset === props.selectedDateOffset && styles.selectedDayText,
                ]}
              >
                {weekdays[date.getDay()]}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isDark && dark.text,
                  offset === props.selectedDateOffset && styles.selectedDayText,
                ]}
              >
                {date.getDate()}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.energyCard, simple && simpleStyles.card, isDark && dark.card]}>
          <View style={styles.energyHeading}>
            <View>
              <Text style={styles.caption}>
                {props.selectedDateOffset === 0
                  ? '오늘'
                  : `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`}{' '}
                먹은 양
              </Text>
              <Text style={[styles.energyValue, simple && simpleStyles.energyValue, isDark && dark.text]}>
                {number(energy?.current)}
                <Text style={styles.energyTarget}> / {number(energy?.target)} kcal</Text>
              </Text>
            </View>
            <Text style={styles.percent}>{energyPercent == null ? '—' : `${energyPercent}%`}</Text>
          </View>
          <ProgressLine value={energy?.current ?? null} target={energy?.target ?? null} />
          <View style={[styles.macroRow, simple && simpleStyles.macroRow]}>
            {props.goals.slice(1).map((goal) => (
              <View key={goal.label} style={[styles.macro, simple && simpleStyles.macro]}>
                <Text style={[styles.macroLabel, simple && simpleStyles.macroLabel]}>{goal.label}</Text>
                <Text style={[styles.macroValue, simple && simpleStyles.macroValue, isDark && dark.text]}>
                  {number(goal.current)}
                  <Text style={styles.macroTarget}>
                    /{number(goal.target)}
                    {goal.unit}
                  </Text>
                </Text>
                <ProgressLine value={goal.current} target={goal.target} />
              </View>
            ))}
          </View>
          {props.hasUnknownItems && (
            <Text style={styles.hint}>영양 정보가 없는 음식은 합계에서 제외됐어요.</Text>
          )}
          {props.nutritionError && (
            <Pressable onPress={props.onRetryNutrition}>
              <Text style={styles.retry}>{props.nutritionError} · 다시 시도</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={props.onOpenProteinGuide} style={styles.guideLink}>
            <Text style={styles.guideLinkText}>단백질 가이드 보기  ›</Text>
          </Pressable>
        </View>

        {props.showRecordControls && (
          <Pressable
            accessibilityRole="button"
            disabled={!canRecordPhoto}
            onPress={() => setPickerOpen(true)}
            style={[styles.photoButton, simple && simpleStyles.photoButton, isDark && dark.card, !canRecordPhoto && styles.photoDisabled]}
          >
            <View style={styles.cameraIcon}>
              <Text style={styles.cameraGlyph}>▣</Text>
            </View>
            <View style={styles.photoCopy}>
              <Text style={[styles.photoTitle, simple && simpleStyles.photoTitle, isDark && dark.text]}>사진으로 기록하기</Text>
              <Text style={styles.photoHint}>
                {canRecordPhoto
                  ? '먹은 음식을 사진과 함께 기록해요'
                  : props.selectedDateOffset < 0
                    ? '지난 날짜의 사진 기록은 아직 지원하지 않아요'
                    : '오늘의 추천 식단을 불러오면 기록할 수 있어요'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle, isDark && dark.text]}>
          {props.selectedDateOffset === 0 ? '오늘 식단' : '선택한 날 식단'}
        </Text>
        {props.mealsLoading && <Text style={styles.stateText}>식단을 불러오고 있어요.</Text>}
        {props.mealsError && (
          <Pressable onPress={props.onRetryMeals} style={styles.stateCard}>
            <Text style={styles.stateText}>{props.mealsError}</Text>
            <Text style={styles.retry}>다시 시도</Text>
          </Pressable>
        )}
        {!props.mealsLoading && !props.mealsError && props.meals.length === 0 && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>이 날짜에 추천된 식단이 없어요.</Text>
          </View>
        )}
        {props.meals.map((meal) => {
          const expanded = expandedId === meal.id;
          return (
            <View key={meal.id} style={[styles.mealCard, simple && simpleStyles.mealCard, isDark && dark.card]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpandedId(expanded ? null : meal.id)}
                style={[styles.mealMain, simple && simpleStyles.mealMain]}
              >
                <View style={styles.mealImage}>
                  {meal.imageUrl ? (
                    <Image source={{ uri: meal.imageUrl }} style={styles.mealImageActual} />
                  ) : (
                    <Text style={styles.mealImageGlyph}>▧</Text>
                  )}
                </View>
                <View style={styles.mealCopy}>
                  <View style={styles.mealTop}>
                    <Text style={[styles.mealName, simple && simpleStyles.mealName, isDark && dark.text]}>
                      {meal.title}{' '}
                      <Text style={styles.mealKcal}>
                        {meal.kcal == null ? '' : `${number(meal.kcal)}kcal`}
                      </Text>
                    </Text>
                    <Text
                      style={[
                        styles.status,
                        meal.status === 'recommended'
                          ? styles.recommended
                          : meal.status === 'skipped'
                            ? styles.skipped
                            : styles.recorded,
                      ]}
                    >
                      {meal.status === 'recommended'
                        ? '추천'
                        : meal.status === 'skipped'
                          ? '건너뜀'
                          : '먹었어요'}
                    </Text>
                  </View>
                  <Text numberOfLines={simple ? undefined : 2} style={[styles.foods, simple && simpleStyles.foods, isDark && dark.secondary]}>
                    {meal.foods}
                  </Text>
                </View>
                <Text style={styles.chevron}>{expanded ? '⌃' : '›'}</Text>
              </Pressable>
              {expanded && (
                <View style={styles.mealDetail}>
                  {meal.note ? <Text style={styles.detailText}>{meal.note}</Text> : null}
                  <View style={styles.mealActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${meal.title} 레시피 보기`}
                      onPress={() => props.onOpenRecipe(meal.id)}
                      style={styles.recipeAction}
                    >
                      <Text style={styles.recipeActionText}>레시피 보기  ›</Text>
                    </Pressable>
                    {props.showRecordControls && (
                      <>
                        <Pressable
                          disabled={!meal.canSave || meal.pending}
                          onPress={() => props.onStatusChange(meal.id, 'eaten')}
                          style={styles.smallAction}
                        >
                          <Text style={styles.smallActionText}>먹었어요</Text>
                        </Pressable>
                        <Pressable
                          disabled={!meal.canSave || meal.pending}
                          onPress={() => props.onRecord(meal.id)}
                          style={styles.smallAction}
                        >
                          <Text style={styles.smallActionText}>다른 음식 기록</Text>
                        </Pressable>
                        <Pressable
                          disabled={!meal.canSave || meal.pending}
                          onPress={() => props.onStatusChange(meal.id, 'skipped')}
                          style={styles.smallAction}
                        >
                          <Text style={styles.smallActionText}>건너뛰기</Text>
                        </Pressable>
                      </>
                    )}
                    {meal.canSave && meal.status === 'recommended' && (
                      <Pressable
                        disabled={meal.regenerating}
                        onPress={() => props.onAlternative(meal.id)}
                        style={styles.alternative}
                      >
                        <Text style={styles.alternativeText}>
                          {meal.regenerating ? '다른 식단을 찾는 중…' : '다른 식단 추천받기'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <Modal
        animationType="fade"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>어느 끼니를 기록할까요?</Text>
            {mealLabels.map(({ id, title }) => {
              const available = props.meals.some((meal) => meal.id === id && meal.canSave);
              return (
                <Pressable
                  key={id}
                  disabled={!available}
                  onPress={() => {
                    setPickerOpen(false);
                    props.onRecord(id);
                  }}
                  style={[styles.pickerRow, !available && styles.disabledDay]}
                >
                  <Text style={styles.pickerRowText}>
                    {title}
                    {available ? '' : ' · 추천 없음'}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPickerOpen(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const purple = '#503DE1';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { paddingHorizontal: 20 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontFamily: fontFamilies.pretendardBold, fontSize: 23, color: '#1C1D22' },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 19,
    marginBottom: 9,
  },
  month: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15, color: '#24252A' },
  today: { color: purple, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 2 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 12 },
  selectedDay: { backgroundColor: '#25232C' },
  disabledDay: { opacity: 0.35 },
  dayName: { color: '#85868E', fontSize: 11 },
  dayNumber: {
    color: '#292A30',
    fontSize: 14,
    fontFamily: fontFamilies.pretendardMedium,
    marginTop: 6,
  },
  selectedDayText: { color: '#FFFFFF' },
  energyCard: {
    backgroundColor: '#F8F9FB',
    borderWidth: 1,
    borderColor: '#E0E2E8',
    borderRadius: 15,
    padding: 15,
    marginTop: 12,
  },
  energyHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  caption: { color: '#777982', fontSize: 11 },
  energyValue: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    color: '#24242A',
    marginTop: 5,
  },
  energyTarget: { fontFamily: fontFamilies.pretendardRegular, color: '#70727A', fontSize: 12 },
  percent: { color: '#303138', fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold },
  track: {
    height: 5,
    backgroundColor: '#E1E2E8',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: '100%', backgroundColor: purple, borderRadius: 4 },
  macroRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  macro: { flex: 1 },
  macroLabel: { color: '#7A7C82', fontSize: 10 },
  macroValue: {
    color: '#25262D',
    fontSize: 11,
    fontFamily: fontFamilies.pretendardSemiBold,
    marginTop: 3,
  },
  macroTarget: { color: '#8A8B93', fontSize: 10, fontFamily: fontFamilies.pretendardRegular },
  hint: { color: '#777982', fontSize: 10, marginTop: 9 },
  retry: { color: purple, fontSize: 12, marginTop: 8, fontFamily: fontFamilies.pretendardSemiBold },
  guideLink: { alignSelf: 'flex-start', paddingTop: 12, paddingBottom: 2 },
  guideLinkText: { color: purple, fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold },
  photoButton: {
    borderWidth: 1,
    borderColor: '#E1E3E8',
    borderRadius: 12,
    minHeight: 55,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  cameraIcon: {
    width: 25,
    height: 25,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F7',
    marginRight: 11,
  },
  cameraGlyph: { color: '#4F4E59', fontSize: 16 },
  photoCopy: { flex: 1 },
  photoTitle: { color: '#28292F', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  photoHint: { color: '#96979D', fontSize: 10, marginTop: 3 },
  chevron: { color: '#7E8088', fontSize: 19 },
  photoDisabled: { opacity: 0.55 },
  sectionTitle: {
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    color: '#1F2025',
    marginTop: 20,
    marginBottom: 10,
  },
  stateCard: { borderWidth: 1, borderColor: '#E3E5E9', borderRadius: 11, padding: 16 },
  stateText: { color: '#777981', fontSize: 13, lineHeight: 20 },
  mealCard: {
    borderWidth: 1,
    borderColor: '#E1E3E8',
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  mealMain: { minHeight: 62, padding: 11, flexDirection: 'row', alignItems: 'center' },
  mealImage: {
    width: 37,
    height: 37,
    borderRadius: 7,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  mealImageActual: { width: '100%', height: '100%' },
  mealImageGlyph: { color: '#A6A7AE', fontSize: 20 },
  mealCopy: { flex: 1 },
  mealTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealName: { color: '#28292E', fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold },
  mealKcal: { color: '#74767D', fontSize: 10, fontFamily: fontFamilies.pretendardRegular },
  status: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  recommended: { color: '#696A72', backgroundColor: '#F1F2F4' },
  recorded: { color: '#198557', backgroundColor: '#E6F7ED' },
  skipped: { color: '#85868C', backgroundColor: '#F2F2F3' },
  foods: { color: '#46474F', fontSize: 11, lineHeight: 16, marginTop: 4 },
  mealDetail: { borderTopWidth: 1, borderTopColor: '#ECEEF1', padding: 12 },
  detailText: { color: '#565860', fontSize: 12, lineHeight: 18 },
  mealActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  smallAction: {
    borderRadius: 7,
    backgroundColor: '#F3F4F7',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  smallActionText: { color: '#35363D', fontSize: 11 },
  recipeAction: { borderRadius: 7, backgroundColor: purple, paddingHorizontal: 11, paddingVertical: 8 },
  recipeActionText: { color: '#FFFFFF', fontSize: 11, fontFamily: fontFamilies.pretendardSemiBold },
  alternative: {
    borderRadius: 7,
    backgroundColor: '#EEEAFE',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  alternativeText: { color: purple, fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
  picker: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  pickerTitle: {
    color: '#24242A',
    fontSize: 17,
    fontFamily: fontFamilies.pretendardBold,
    marginBottom: 10,
  },
  pickerRow: {
    minHeight: 51,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerRowText: { color: '#292A30', fontSize: 14 },
  cancel: { minHeight: 47, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: '#75777E', fontSize: 13 },
});

const simpleStyles = StyleSheet.create({
  title: { fontSize: 29 },
  card: { padding: 20 },
  energyValue: { fontSize: 25 },
  macroRow: { flexDirection: 'column', gap: 14 },
  macro: { flex: 0 },
  macroLabel: { fontSize: 15 },
  macroValue: { fontSize: 18 },
  photoButton: { minHeight: 78 },
  photoTitle: { fontSize: 18 },
  sectionTitle: { fontSize: 20 },
  mealCard: { marginBottom: 12 },
  mealMain: { minHeight: 84 },
  mealName: { fontSize: 17 },
  foods: { fontSize: 14, lineHeight: 21 },
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
});
