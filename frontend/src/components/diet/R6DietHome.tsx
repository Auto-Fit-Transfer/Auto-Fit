import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import InfoIcon from '@/assets/icons/ui/info.svg';
import { darkColors, fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { Text } from '@/src/components/common';

export type R6Meal = {
  id: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  kcal: number | null;
  foods: string;
  note: string;
  detail: string | null;
  photoUrl?: string;
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

function ProgressLine({ value, target, thick = false }: { value: number | null; target: number | null; thick?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const percent =
    value != null && target != null && target > 0
      ? Math.min(100, Math.max(0, Math.round((value / target) * 100)))
      : 0;
  return (
    <View style={[styles.track, thick && styles.trackThick]}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
}

export function R6DietHome(props: Props) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
          <SimpleReadButton text={`${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 식단입니다. 먹은 양은 ${number(energy?.current)}킬로칼로리입니다.`} />
        </View>
        <View style={[styles.weekRow, isDark && dark.card]}>
          {week.map(({ date, offset }) => {
            const selected = offset === props.selectedDateOffset;
            return (
              <Pressable
                key={offset}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={offset < -6 || offset > 6}
                onPress={() => props.onSelectDateOffset(offset)}
                style={[styles.day, selected && styles.selectedDay, selected && isDark && dark.root, (offset < -6 || offset > 6) && styles.disabledDay]}
              >
                <Text style={[styles.dayName, selected && styles.selectedDayName, isDark && dark.secondary]}>{weekdays[date.getDay()]}</Text>
                <Text style={[styles.dayNumber, selected && styles.selectedDayNumber, isDark && dark.text]}>{date.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.energyCard, simple && simpleStyles.card, isDark && dark.card]}>
          <View style={styles.energyHeading}>
            <View>
              <Text style={[styles.caption, isDark && dark.secondary]}>
                {props.selectedDateOffset === 0
                  ? '오늘'
                  : `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`}{' '}
                먹은 양
              </Text>
              <Text style={[styles.energyValue, simple && simpleStyles.energyValue, isDark && dark.text]}>
                {number(energy?.current)}
                <Text style={[styles.energyTarget, isDark && dark.secondary]}> / {number(energy?.target)} kcal</Text>
              </Text>
            </View>
            <Text style={[styles.percent, isDark && dark.text]}>{energyPercent == null ? '—' : `${energyPercent}%`}</Text>
          </View>
          <ProgressLine value={energy?.current ?? null} target={energy?.target ?? null} />
          <View style={[styles.macroRow, simple && simpleStyles.macroRow]}>
            {props.goals.slice(1).map((goal) => (
              <View key={goal.label} style={[styles.macro, simple && simpleStyles.macro]}>
                <Text style={[styles.macroLabel, simple && simpleStyles.macroLabel, isDark && dark.secondary]}>{goal.label}</Text>
                <Text style={[styles.macroValue, simple && simpleStyles.macroValue, isDark && dark.text]}>
                  {number(goal.current)} / {number(goal.target)}{goal.unit}
                </Text>
                <ProgressLine thick value={goal.current} target={goal.target} />
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
            <Text style={[styles.guideLinkText, isDark && dark.secondary]}>단백질 가이드 보기  ›</Text>
          </Pressable>
        </View>

        {props.showRecordControls && (
          <Pressable
            accessibilityRole="button"
            disabled={!canRecordPhoto}
            onPress={() => setPickerOpen(true)}
            style={[styles.photoButton, simple && simpleStyles.photoButton, isDark && dark.card, !canRecordPhoto && styles.photoDisabled]}
          >
            <View style={[styles.cameraIcon, isDark && dark.card]}>
              <CameraIcon color={isDark ? darkColors.textPrimary : colors.textPrimary} height={22} width={22} />
            </View>
            <View style={styles.photoCopy}>
              <Text style={[styles.photoTitle, simple && simpleStyles.photoTitle, isDark && dark.text]}>사진으로 기록하기</Text>
              <Text style={[styles.photoHint, isDark && dark.secondary]}>
                {canRecordPhoto
                  ? '먹은 음식을 사진과 함께 기록해요'
                  : props.selectedDateOffset < 0
                    ? '지난 날짜의 사진 기록은 아직 지원하지 않아요'
                    : '오늘의 추천 식단을 불러오면 기록할 수 있어요'}
              </Text>
            </View>
            <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
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
          const recommended = meal.status === 'recommended';
          const showActions = recommended || expandedId === meal.id;
          const canRecord = props.showRecordControls && meal.canSave && !meal.pending;
          const action = (label: string, onPress: () => void, disabled = false) => (
            <Pressable
              accessibilityLabel={`${meal.title} ${label}`}
              accessibilityRole="button"
              disabled={disabled}
              key={label}
              onPress={onPress}
              style={[styles.smallAction, isDark && dark.card, disabled && styles.disabledDay]}
            >
              <Text style={[styles.smallActionText, isDark && dark.text]}>{label}</Text>
            </Pressable>
          );
          return (
            <View key={meal.id} style={[styles.mealCard, simple && simpleStyles.mealCard, isDark && dark.card]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showActions }}
                disabled={recommended}
                onPress={() => setExpandedId(expandedId === meal.id ? null : meal.id)}
                style={styles.mealMain}
              >
                <View style={styles.mealTop}>
                  <Text style={[styles.mealName, simple && simpleStyles.mealName, isDark && dark.text]}>
                    {meal.title}{' '}
                    <Text style={[styles.mealKcal, isDark && dark.secondary]}>
                      {meal.kcal == null ? '' : `${number(meal.kcal)}kcal`}
                    </Text>
                  </Text>
                  <View style={[styles.status, meal.status === 'eaten' || meal.status === 'modified' ? styles.recorded : null]}>
                    {meal.status === 'eaten' || meal.status === 'modified' ? (
                      <CheckIcon color={colors.success} height={14} width={14} />
                    ) : recommended ? (
                      <InfoIcon color={colors.textSecondary} height={14} width={14} />
                    ) : null}
                    <Text style={[styles.statusText, (meal.status === 'eaten' || meal.status === 'modified') && styles.recordedText]}>
                      {recommended ? '추천' : meal.status === 'skipped' ? '건너뜀' : '먹었어요'}
                    </Text>
                  </View>
                </View>
                <View style={styles.mealBody}>
                  {meal.photoUrl ? <Image source={{ uri: meal.photoUrl }} style={styles.mealPhoto} /> : null}
                  <View style={styles.mealCopy}>
                    <Text numberOfLines={simple ? undefined : 2} style={[styles.foods, simple && simpleStyles.foods, isDark && dark.text]}>
                      {meal.foods}
                    </Text>
                    {meal.detail ? <Text style={[styles.detailText, isDark && dark.secondary]}>{meal.detail}</Text> : null}
                  </View>
                </View>
                {recommended && meal.note ? (
                  <View style={styles.noteRow}>
                    <InfoIcon color={colors.textSecondary} height={16} width={16} />
                    <Text style={[styles.note, isDark && dark.secondary]}>{meal.note}</Text>
                  </View>
                ) : null}
              </Pressable>
              {showActions ? (
                <View style={styles.mealActions}>
                  {meal.status !== 'eaten' && props.showRecordControls && meal.canSave ? action('먹었어요', () => props.onStatusChange(meal.id, 'eaten'), !canRecord) : null}
                  {recommended && meal.canSave ? action(meal.regenerating ? '찾는 중…' : '바꾸기', () => props.onAlternative(meal.id), meal.regenerating) : null}
                  {!recommended && props.showRecordControls && meal.canSave ? action('다른 음식 기록', () => props.onRecord(meal.id), !canRecord) : null}
                  {meal.status !== 'skipped' && props.showRecordControls && meal.canSave ? action('건너뛰기', () => props.onStatusChange(meal.id, 'skipped'), !canRecord) : null}
                  {action('레시피', () => props.onOpenRecipe(meal.id))}
                </View>
              ) : null}
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
                <Pressable hitSlop={16}
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
                  <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
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

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20 },
    titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    title: { fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30, color: colors.textPrimary },
    weekRow: { backgroundColor: colors.surfaceMuted, borderRadius: 16, flexDirection: 'row', gap: 2, marginTop: 16, padding: 4 },
    day: { alignItems: 'center', borderRadius: 12, flex: 1, gap: 2, minHeight: 61, justifyContent: 'center' },
    selectedDay: { backgroundColor: colors.background },
    disabledDay: { opacity: 0.35 },
    dayName: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    selectedDayName: { color: colors.textPrimary },
    dayNumber: { color: colors.textBody, fontSize: 16, lineHeight: 24 },
    selectedDayNumber: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    energyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 18 },
    energyHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    energyValue: { fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30, color: colors.textPrimary, marginTop: 2 },
    energyTarget: { fontFamily: fontFamilies.pretendardRegular, color: colors.textSecondary, fontSize: 14 },
    percent: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    track: { height: 6, backgroundColor: colors.gaugeTrack, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
    trackThick: { borderRadius: 4, height: 8, marginTop: 6 },
    fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
    macroRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    macro: { flex: 1 },
    macroLabel: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    macroValue: { color: colors.textPrimary, fontSize: 14, lineHeight: 21, fontFamily: fontFamilies.pretendardMedium, marginTop: 2 },
    hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 },
    retry: { color: colors.primaryText, fontSize: 14, marginTop: 8, fontFamily: fontFamilies.pretendardMedium },
    guideLink: { alignSelf: 'flex-start', paddingTop: 12 },
    guideLinkText: { color: colors.textBody, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    photoButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 16, minHeight: 75, paddingHorizontal: 16 },
    cameraIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    photoCopy: { flex: 1 },
    photoTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    photoHint: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    photoDisabled: { opacity: 0.55 },
    sectionTitle: { fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26, color: colors.textPrimary, marginTop: 20, marginBottom: 12 },
    stateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
    stateText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    mealCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginBottom: 16, padding: 16 },
    mealMain: { gap: 8 },
    mealTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    mealName: { color: colors.textPrimary, fontSize: 14, lineHeight: 21, fontFamily: fontFamilies.pretendardMedium },
    mealKcal: { color: colors.textSecondary, fontSize: 14, fontFamily: fontFamilies.pretendardRegular },
    status: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 999, flexDirection: 'row', gap: 4, height: 26, paddingHorizontal: 10 },
    statusText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    recorded: { backgroundColor: colors.successLight },
    recordedText: { color: colors.success },
    mealBody: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    mealPhoto: { backgroundColor: colors.background, borderRadius: 12, height: 48, width: 48 },
    mealCopy: { flex: 1, gap: 2, minWidth: 0 },
    foods: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    detailText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    noteRow: { flexDirection: 'row', gap: 4 },
    note: { color: colors.textSecondary, flex: 1, fontSize: 12, lineHeight: 18 },
    mealActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12 },
    smallAction: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    smallActionText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    modalOverlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
    picker: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    pickerTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontFamily: fontFamilies.pretendardBold,
      marginBottom: 10,
    },
    pickerRow: {
      minHeight: 51,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceMuted,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pickerRowText: { color: colors.textPrimary, fontSize: 14 },
    cancel: { minHeight: 47, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    cancelText: { color: colors.textSecondary, fontSize: 13 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  title: {},
  card: { padding: 20 },
  energyValue: {},
  macroRow: { flexDirection: 'column', gap: 14 },
  macro: { flex: 0 },
  macroLabel: {},
  macroValue: {},
  photoButton: { minHeight: 78 },
  photoTitle: {},
  sectionTitle: {},
  mealCard: { marginBottom: 12 },
  mealName: {},
  foods: {},
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
});
