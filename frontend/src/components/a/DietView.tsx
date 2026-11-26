import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import type { R6DietHomeProps, R6Meal } from '@/src/components/diet/R6DietHome';
import type { DayCalories } from '@/src/features/diet/weekCalories';
import { menuStyleLabel, type MenuStyle } from '@/src/features/diet/menuStyle';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { HeroHead } from './sprites';
import { useHero } from './useHero';

// Renewal A's diet tab. It takes exactly what the earlier diet home (R6DietHome) took, so the tab's own
// logic is untouched: my character says why the next meal was chosen, the first card is the day in
// numbers, the second is the day's meals (a tap opens what a meal can do), and the big button records by photo.
const mealLabels: { id: R6Meal['id']; title: string }[] = [
  { id: 'breakfast', title: '아침' },
  { id: 'lunch', title: '점심' },
  { id: 'dinner', title: '저녁' },
  { id: 'snack', title: '간식' },
];
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const number = (value: number | null | undefined) =>
  value == null ? '—' : Math.round(value).toLocaleString('ko-KR');

function dateAtOffset(today: Date, offset: number) {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date;
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const PLOT = 72;

// onAdjust: 내일 맞추기 (TomorrowSheet). The tab passes it once the back-end and AI calls exist.
// burned: today's workout and run calories, taken off before anything counts as over (user, 11/19).
// onMenuStyle: 일반식 / 건강식 (MenuStyleSheet). The tab passes it once the back-end saves the choice.
export function DietView(props: R6DietHomeProps & {
  week?: DayCalories[] | null;
  onAdjust?: () => void;
  burned?: number | null;
  menuStyle?: MenuStyle | null;
  onMenuStyle?: () => void;
  over?: number | null; // the server's overage (after the workout); when given it wins over the sum here
  onMakeWeek?: () => void; // the week has no plan yet
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { who, tierIndex } = useHero();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openId, setOpenId] = useState<R6Meal['id'] | null>(null);
  const canRecordPhoto = props.meals.some((meal) => meal.canSave);
  const selectedDate = dateAtOffset(props.today, props.selectedDateOffset);
  const isToday = props.selectedDateOffset === 0;
  const week = useMemo(() => {
    const mondayOffset = props.selectedDateOffset - ((selectedDate.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => {
      const offset = mondayOffset + index;
      return { date: dateAtOffset(props.today, offset), offset };
    });
  }, [props.selectedDateOffset, props.today, selectedDate]);

  const [energy, ...macros] = props.goals;
  const eaten = energy?.current ?? null;
  const target = energy?.target ?? null;
  // What is still planned: the recommended meals nobody has answered yet.
  const planned = props.meals.reduce((sum, meal) => sum + (meal.status === 'recommended' ? meal.kcal ?? 0 : 0), 0);
  const eatenRatio = eaten != null && target ? Math.min(100, (eaten / target) * 100) : 0;
  const plannedRatio = target ? Math.min(100, ((eaten ?? 0) + planned) / target * 100) : 0;
  const next = props.meals.find((meal) => meal.status === 'recommended');
  const todayKey = `${props.today.getFullYear()}-${String(props.today.getMonth() + 1).padStart(2, '0')}-${String(props.today.getDate()).padStart(2, '0')}`;
  const weekTarget = props.week?.find((day) => day.target)?.target ?? target ?? null;
  const overBy = props.over !== undefined ? props.over : eaten != null && target ? eaten - target - (props.burned ?? 0) : null;
  // a little room over the tallest bar (or the goal) for its number
  const weekTop = Math.max(weekTarget ?? 0, ...(props.week ?? []).map((day) => day.kcal ?? 0)) * 1.15;
  // breakfast, lunch and dinner the user answered with what they ate (the planned menu or something else)
  const mains = props.meals.filter((meal) => meal.id !== 'snack' && (meal.status === 'eaten' || meal.status === 'modified')).length;
  const say = next?.note
    ? next.note
    : props.meals.length > 0 && !next
      ? '오늘 식단을 모두 기록했어요!'
      : '먹은 것을 사진으로 남겨 보세요';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110, paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bar}>
          <Pressable
            accessibilityLabel="홈으로"
            accessibilityRole="button"
            onPress={() => router.navigate('/home')}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <BackIcon color={colors.ink} height={22} width={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.heading}>
            {isToday ? '오늘의 식단' : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 식단`}
          </Text>
          {/* the quest "세 끼 기록" (a-diet.html): a mark for each of the three meals recorded that day */}
          <View accessibilityLabel={`세 끼 기록 ${mains} / 3`} accessible style={styles.mains}>
            <Text style={styles.mainsLabel}>세 끼 중 {mains}끼 기록</Text>
            {[0, 1, 2].map((index) => (
              <View key={index} style={[styles.pip, index < mains && styles.pipOn]} />
            ))}
          </View>
          <SimpleReadButton
            text={`${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 식단입니다. 먹은 양은 ${number(eaten)}킬로칼로리입니다.`}
          />
        </View>

        <View style={styles.ask}>
          <View style={styles.face}>
            <HeroHead tier={tierIndex} who={who} />
          </View>
          <View style={styles.say}>
            <Text style={styles.body}>{say}</Text>
          </View>
        </View>

        <View style={styles.week}>
          {/* Last week / this week: the days open stay today ±6, as before (Hyunho asked for 11/20 on 11/23). */}
          <Pressable
            accessibilityLabel="지난주"
            accessibilityRole="button"
            accessibilityState={{ disabled: week[0].offset <= -6 }}
            disabled={week[0].offset <= -6}
            hitSlop={8}
            onPress={() => props.onSelectDateOffset(props.selectedDateOffset - 7)}
            style={[styles.weekArrow, week[0].offset <= -6 && styles.off]}
          >
            <BackIcon color={colors.ink} height={16} width={16} />
          </Pressable>
          {week.map(({ date, offset }) => {
            const selected = offset === props.selectedDateOffset;
            const disabled = offset < -6 || offset > 6;
            return (
              <Pressable
                key={offset}
                accessibilityLabel={`${date.getMonth() + 1}월 ${date.getDate()}일`}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => props.onSelectDateOffset(offset)}
                style={[styles.day, selected && styles.dayOn, disabled && styles.off]}
              >
                <Text style={[styles.small, selected && styles.dayOnText]}>{weekdays[date.getDay()]}</Text>
                <Text style={[styles.body, offset === 0 && !selected && styles.todayText]}>{date.getDate()}</Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityLabel="다음 주"
            accessibilityRole="button"
            accessibilityState={{ disabled: week[6].offset >= 6 }}
            disabled={week[6].offset >= 6}
            hitSlop={8}
            onPress={() => props.onSelectDateOffset(props.selectedDateOffset + 7)}
            style={[styles.weekArrow, week[6].offset >= 6 && styles.off]}
          >
            <CaretRightIcon color={colors.ink} height={16} width={16} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.big}>
            {number(eaten)}
            <Text style={styles.small}> / {number(target)}kcal</Text>
          </Text>
          <View style={styles.line}>
            <View style={[styles.linePlan, { width: `${plannedRatio}%` }]} />
            <View style={[styles.lineAte, { width: `${eatenRatio}%` }]} />
          </View>
          <View style={styles.spread}>
            <Text style={styles.small}>
              {planned > 0 ? `예정 ${number(planned)}kcal` : eaten != null && target ? `목표의 ${Math.round((eaten / target) * 100)}%` : ''}
            </Text>
            <Pressable accessibilityRole="button" hitSlop={14} onPress={props.onOpenProteinGuide}>
              <Text style={styles.link}>단백질 가이드</Text>
            </Pressable>
          </View>
          <View style={styles.macros}>
            {macros.map((goal) => (
              <View key={goal.label} style={styles.macro}>
                <Text style={styles.small}>{goal.label}</Text>
                <Text style={styles.body}>
                  {number(goal.current)} / {number(goal.target)}
                  {goal.unit}
                </Text>
              </View>
            ))}
          </View>
          {props.hasUnknownItems ? <Text style={styles.small}>영양 정보가 없는 음식은 합계에서 제외됐어요.</Text> : null}
          {/* over today's goal (a-diet.html): made up tomorrow, only on the day itself */}
          {props.onAdjust && isToday && ((overBy ?? 0) > 0 || (eaten != null && target && eaten > target && overBy != null)) ? (
            (overBy ?? 0) > 0 ? (
              <View style={[styles.spread, styles.over]}>
                <Text style={[styles.body, styles.grow]}>
                  목표보다 {number(overBy)}kcal 더 먹었어요{props.burned ? ` (운동\u00A0${number(props.burned)}kcal\u00A0빼고)` : ''}
                </Text>
                <Pressable accessibilityRole="button" onPress={props.onAdjust} style={({ pressed }) => [styles.mini, pressed && styles.pressedSoft]}>
                  <Text style={[styles.small, styles.miniText]}>내일 맞추기</Text>
                </Pressable>
              </View>
            ) : (
              // the workout already used up what went over: nothing to ask
              <Text style={[styles.body, styles.over]}>운동으로 {number(props.burned)}kcal를 써서 오늘 목표 안이에요.</Text>
            )
          ) : null}
          {props.nutritionError ? (
            <Pressable accessibilityRole="button" onPress={props.onRetryNutrition}>
              <Text style={styles.link}>{props.nutritionError} · 다시 시도</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.spread}>
            <Text style={[styles.title, styles.grow]}>{isToday ? '오늘 식단' : '선택한 날 식단'}</Text>
            {/* on today only, as in a-diet.html: beside '선택한 날 식단' it would push the title onto two lines */}
            {props.onMenuStyle && isToday ? (
              <Pressable
                accessibilityLabel="건강식 위주와 일반식 위주 중 고르기"
                accessibilityRole="button"
                onPress={props.onMenuStyle}
                style={({ pressed }) => [styles.mini, pressed && styles.pressedSoft]}
              >
                <Text style={[styles.small, styles.miniText]}>{menuStyleLabel(props.menuStyle)}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={props.onOpenWeekly}
              style={({ pressed }) => [styles.mini, pressed && styles.pressedSoft]}
            >
              <Text style={styles.small}>7일 식단</Text>
            </Pressable>
          </View>
          {props.mealsLoading ? <Text style={styles.small}>식단을 불러오고 있어요.</Text> : null}
          {props.mealsError ? (
            <Pressable accessibilityRole="button" onPress={props.onRetryMeals}>
              <Text style={styles.link}>{props.mealsError} · 다시 시도</Text>
            </Pressable>
          ) : null}
          {!props.mealsLoading && !props.mealsError && props.meals.length === 0 ? (
            props.onMakeWeek ? (
              <Pressable accessibilityRole="button" onPress={props.onMakeWeek} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
                <Text style={styles.goText}>이번 주 식단 짜기</Text>
              </Pressable>
            ) : (
              <Text style={styles.small}>이 날짜에 추천된 식단이 없어요.</Text>
            )
          ) : null}
          {props.meals.map((meal) => {
            const recommended = meal.status === 'recommended';
            const recorded = meal.status === 'eaten' || meal.status === 'modified';
            const open = openId === meal.id;
            const canRecord = props.showRecordControls && meal.canSave && !meal.pending;
            const action = (label: string, onPress: () => void, disabled = false, main = false) => (
              <Pressable
                key={label}
                accessibilityLabel={`${meal.title} ${label}`}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={onPress}
                style={({ pressed }) => [styles.mini, main && styles.miniMain, disabled && styles.off, pressed && styles.pressedSoft]}
              >
                <Text style={[styles.small, styles.miniText]}>{label}</Text>
              </Pressable>
            );
            return (
              <View key={meal.id} style={styles.mealLine}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenId(open ? null : meal.id)}
                  style={styles.meal}
                >
                  <Text style={[styles.small, styles.slot]}>{meal.title}</Text>
                  <Text numberOfLines={open ? undefined : 1} style={[styles.body, styles.mealName]}>
                    {meal.foods}
                  </Text>
                  <Text style={recorded ? styles.body : styles.small}>
                    {recorded
                      ? meal.kcal == null ? '기록' : `${number(meal.kcal)}kcal`
                      : meal.status === 'skipped' ? '건너뜀' : meal.kcal == null ? '예정' : `${number(meal.kcal)}kcal 예정`}
                  </Text>
                </Pressable>
                {open ? (
                  <View style={styles.mealOpen}>
                    {meal.photoUrl ? <Image source={{ uri: meal.photoUrl }} style={styles.photo} /> : null}
                    {meal.detail ? <Text style={styles.small}>{meal.detail}</Text> : null}
                    {meal.allergyWarning ? (
                      <Text accessibilityRole={meal.allergyBlocked ? 'alert' : undefined} style={meal.allergyBlocked ? styles.blocked : styles.small}>
                        {meal.allergyWarning}
                      </Text>
                    ) : null}
                    {recommended && meal.note ? <Text style={styles.small}>{meal.note}</Text> : null}
                    <View style={styles.actions}>
                      {meal.status !== 'eaten' && props.showRecordControls && meal.canSave && !meal.allergyBlocked
                        ? action('먹었어요', () => props.onStatusChange(meal.id, 'eaten'), !canRecord, true)
                        : null}
                      {recommended && meal.canSave && !meal.allergyBlocked
                        ? action(meal.regenerating ? '찾는 중…' : '바꾸기', () => props.onAlternative(meal.id), meal.regenerating)
                        : null}
                      {meal.canRegenerateDay
                        ? action(props.dayRegenerating ? '추천 중…' : '하루 식단 다시 추천', props.onRegenerateDay, props.dayRegenerating)
                        : null}
                      {(!recommended || meal.allergyBlocked) && props.showRecordControls && meal.canSave
                        ? action('다른 음식 기록', () => props.onRecord(meal.id), !canRecord)
                        : null}
                      {meal.status !== 'skipped' && props.showRecordControls && meal.canSave
                        ? action('건너뛰기', () => props.onStatusChange(meal.id, 'skipped'), !canRecord)
                        : null}
                      {meal.allergyBlocked ? null : action('레시피', () => props.onOpenRecipe(meal.id))}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {props.showRecordControls ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canRecordPhoto }}
            disabled={!canRecordPhoto}
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.go, !canRecordPhoto && styles.goOff, pressed && styles.pressed]}
          >
            <Text style={styles.goText}>사진으로 기록</Text>
          </Pressable>
        ) : null}
        {props.showRecordControls && !canRecordPhoto ? (
          <Text style={[styles.small, styles.center]}>
            {props.selectedDateOffset < 0 ? '지난 날짜의 사진 기록은 아직 지원하지 않아요' : '오늘의 추천 식단을 불러오면 기록할 수 있어요'}
          </Text>
        ) : null}
        {/* this week (a-diet.html): what was eaten each day against the day's goal, the dashed line */}
        {props.week && weekTop > 0 ? (
          <View style={styles.card}>
            <View style={styles.spread}>
              <Text style={styles.body}>이번 주</Text>
              {weekTarget ? <Text style={styles.small}>하루 목표 {number(weekTarget)}kcal</Text> : null}
            </View>
            <View style={styles.plot}>
              {weekTarget ? (
                <View pointerEvents="none" style={[styles.gline, { bottom: Math.round((weekTarget / weekTop) * PLOT) }]}>
                  <Svg height={2} width="100%">
                    <Line stroke={colors.textSecondary} strokeDasharray="5 4" strokeWidth={2} x1="0" x2="100%" y1="1" y2="1" />
                  </Svg>
                </View>
              ) : null}
              {props.week.map((day) => {
                const height = day.kcal ? Math.max(4, Math.round((day.kcal / weekTop) * PLOT)) : 0;
                return (
                  <View accessibilityLabel={`${day.date} ${day.kcal == null ? '기록 없음' : `${number(day.kcal)}킬로칼로리`}`} accessible key={day.date} style={styles.col}>
                    {height ? <Text numberOfLines={1} style={styles.n}>{number(day.kcal)}</Text> : null}
                    {height ? <View style={[styles.weekBar, { height }, day.date === props.selectedDateKey && styles.weekBarOn]} /> : null}
                  </View>
                );
              })}
            </View>
            <View style={styles.labels}>
              {props.week.map((day, index) => (
                <Text key={day.date} style={[styles.small, styles.wd, day.date === todayKey && styles.wdNow]}>
                  {day.date === todayKey ? '오늘' : WEEKDAYS[index]}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <AppBottomSheet onClose={() => setPickerOpen(false)} title="어느 끼니를 기록할까요?" visible={pickerOpen}>
        <View style={styles.picker}>
          {mealLabels.map(({ id, title }) => {
            const available = props.meals.some((meal) => meal.id === id && meal.canSave);
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ disabled: !available }}
                disabled={!available}
                onPress={() => {
                  setPickerOpen(false);
                  props.onRecord(id);
                }}
                style={[styles.pickerRow, !available && styles.off]}
              >
                <Text style={styles.body}>
                  {title}
                  {available ? '' : ' · 추천 없음'}
                </Text>
                <CaretRightIcon color={colors.textSecondary} height={16} width={16} />
              </Pressable>
            );
          })}
        </View>
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const ledge = `0 4px 0 ${colors.ink}`;
  const soft = '0 4px 0 rgba(32, 35, 63, 0.3)';
  const outline = { backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 2 } as const;
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 14, paddingHorizontal: 16 },
    pressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 4 }] },
    pressedSoft: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 3 }] },
    off: { opacity: 0.4 },
    small: { ...p12, color: colors.textSecondary },
    body: { ...p15, color: colors.ink },
    center: { textAlign: 'center' },
    spread: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    link: { ...p12, color: colors.textSecondary, textDecorationLine: 'underline' },

    bar: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 48 },
    back: { ...outline, alignItems: 'center', borderRadius: 14, boxShadow: ledge, height: 44, justifyContent: 'center', width: 44 },
    heading: { color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    mains: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    mainsLabel: { color: colors.textSecondary, fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17, marginRight: 2 },
    pip: { backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 4, borderWidth: 2, height: 14, width: 14 },
    pipOn: { backgroundColor: colors.primary },
    over: { borderTopColor: colors.track, borderTopWidth: 2, paddingTop: 10 },
    grow: { flex: 1, minWidth: 0 },
    plot: { borderBottomColor: colors.ink, borderBottomWidth: 2, flexDirection: 'row', height: PLOT + 20 },
    col: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
    // the number sits over the goal line on a white ground, as in the prototype
    n: { ...p12, backgroundColor: colors.surface, color: colors.ink, fontSize: 12, marginBottom: 2, paddingHorizontal: 2, zIndex: 1 },
    weekBar: { backgroundColor: colors.primaryLight, borderColor: colors.ink, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 2, width: 20 },
    // the day on show is violet, like the chosen date above
    weekBarOn: { backgroundColor: colors.primary },
    gline: { height: 2, left: 0, position: 'absolute', right: 0 },
    labels: { flexDirection: 'row', marginTop: -4 },
    wd: { flex: 1, textAlign: 'center' },
    wdNow: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold },
    ask: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    face: {
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 11,
      borderWidth: 2,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    say: { ...outline, borderRadius: 14, flex: 1, paddingHorizontal: 13, paddingVertical: 8 },

    week: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    weekArrow: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', width: 22 },
    day: { ...outline, alignItems: 'center', borderRadius: 12, boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)', flex: 1, paddingVertical: 5 },
    // The day I am looking at is violet; today's number is in the accent colour until it is chosen.
    dayOn: { backgroundColor: colors.primary, boxShadow: `0 3px 0 ${colors.ink}` },
    // On violet the grey weekday would be hard to read.
    dayOnText: { color: colors.onPrimary },
    todayText: { color: colors.primaryText },

    card: { ...outline, borderRadius: 18, boxShadow: soft, gap: 10, padding: 14 },
    big: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 36, lineHeight: 40 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    line: { backgroundColor: colors.track, borderColor: colors.ink, borderRadius: 99, borderWidth: 2, height: 16, overflow: 'hidden' },
    // What the app has planned sits behind what I ate, in the pale violet.
    linePlan: { backgroundColor: colors.primaryLight, bottom: 0, left: 0, position: 'absolute', top: 0 },
    lineAte: { backgroundColor: colors.primary, bottom: 0, left: 0, position: 'absolute', top: 0 },
    macros: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2, flexDirection: 'row', gap: 14, paddingTop: 10 },
    macro: { flex: 1, gap: 2, minWidth: 0 },

    mini: { ...outline, borderRadius: 10, boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)', height: 32, justifyContent: 'center', paddingHorizontal: 10 },
    miniMain: { backgroundColor: colors.primary, boxShadow: `0 3px 0 ${colors.ink}` },
    miniText: { color: colors.ink },
    mealLine: { borderTopColor: colors.track, borderTopWidth: 2 },
    meal: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 10 },
    slot: { width: 28 },
    mealName: { flex: 1 },
    mealOpen: { gap: 8, paddingBottom: 12, paddingLeft: 38 },
    photo: { borderColor: colors.ink, borderRadius: 12, borderWidth: 2, height: 120, width: '100%' },
    blocked: { ...p12, color: colors.danger },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 3 },

    go: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: ledge,
      height: 52,
      justifyContent: 'center',
    },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    picker: { paddingBottom: 8 },
    pickerRow: {
      alignItems: 'center',
      borderTopColor: colors.track,
      borderTopWidth: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 52,
    },
  } as const;
}
