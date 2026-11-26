import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import type { R6DietHomeProps, R6Meal } from '@/src/components/diet/R6DietHome';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import type { DayCalories } from '@/src/features/diet/weekCalories';
import { menuStyleLabel, type MenuStyle } from '@/src/features/diet/menuStyle';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { Headline, type HeadlinePart } from './Headline';

// Renewal B's diet tab. It takes exactly what the earlier diet home (R6DietHome) took, so the tab's
// own logic is untouched: the big headline says how much I ate, the first card is the day in numbers,
// and the second is the day's meals, one line each; a tap opens what that meal can do.
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

// The same extras renewal A's diet tab takes (app/(tabs)/diet.tsx passes them):
// onAdjust: 내일 맞추기. burned: today's workout calories, taken off before anything counts as over.
// onMenuStyle: 일반식 / 건강식. over: the server's overage, which wins over the sum here.
// onMakeWeek: the week has no plan yet. week: this week's eaten calories against the day's goal.
export function DietView(props: R6DietHomeProps & {
  week?: DayCalories[] | null;
  onAdjust?: () => void;
  burned?: number | null;
  menuStyle?: MenuStyle | null;
  onMenuStyle?: () => void;
  over?: number | null;
  onMakeWeek?: () => void;
  // As the home (11/26): who picked it, above the headline; the next meal with its why in the black
  // card, with the three answers - 먹었어요 (take it) · 다른 메뉴 (meet halfway) · 다른 음식 기록 (my own way).
  by?: { characterId: ChatCharacterId; text: string };
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
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
  // What is still planned today: the recommended meals nobody has answered yet.
  const planned = props.meals.reduce(
    (sum, meal) => sum + (meal.status === 'recommended' ? meal.kcal ?? 0 : 0),
    0,
  );
  const eatenRatio = eaten != null && target ? Math.min(100, (eaten / target) * 100) : 0;
  const plannedRatio = target ? Math.max(0, Math.min(100 - eatenRatio, (planned / target) * 100)) : 0;
  const dayLabel = isToday ? '오늘' : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`;
  const todayKey = `${props.today.getFullYear()}-${String(props.today.getMonth() + 1).padStart(2, '0')}-${String(props.today.getDate()).padStart(2, '0')}`;
  const weekTarget = props.week?.find((day) => day.target)?.target ?? target ?? null;
  const overBy = props.over !== undefined ? props.over : eaten != null && target ? eaten - target - (props.burned ?? 0) : null;
  const weekTop = Math.max(weekTarget ?? 0, ...(props.week ?? []).map((day) => day.kcal ?? 0)) * 1.15;
  const headline: HeadlinePart[][] = eaten
    ? [[{ text: dayLabel }], [{ text: `${number(eaten)}kcal`, mark: true }, { text: ' 먹었어요' }]]
    : planned
      ? [[{ text: `${dayLabel} 식단은` }], [{ text: `${number(planned)}kcal`, mark: true }, { text: '로 짰어요' }]]
      : [[{ text: dayLabel }], [{ text: '기록이 아직 없어요' }]];
  // The one sentence under the headline: why the next meal was chosen, in the server's words.
  const next = props.meals.find((meal) => meal.status === 'recommended');
  const line = next?.note
    ? next.note
    : props.meals.length > 0 && !next
      ? `${dayLabel} 식단을 모두 기록했어요`
      : undefined;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {props.by ? (
          <View style={styles.by}>
            <View style={styles.face}>
              <ChatCharacterAvatar characterId={props.by.characterId} size={26} />
            </View>
            <Text style={styles.byText}>{props.by.text}</Text>
          </View>
        ) : null}
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Headline lines={headline} />
          </View>
          <SimpleReadButton
            text={`${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 식단입니다. 먹은 양은 ${number(eaten)}킬로칼로리입니다.`}
          />
        </View>
        {props.by && next && isToday ? (
          <View style={styles.ai}>
            <Text style={styles.aiTitle}>{next.note || `${next.title} 메뉴를 골라 뒀어요`}</Text>
            <Text style={styles.aiFacts}>{[next.title, next.foods, next.kcal == null ? null : `${number(next.kcal)}kcal`].filter(Boolean).join(' · ')}</Text>
            {next.allergyWarning ? <Text style={styles.aiWarn}>{next.allergyWarning}</Text> : null}
            <View style={styles.choices}>
              {props.showRecordControls && next.canSave && !next.allergyBlocked ? (
                <Pressable accessibilityLabel={`${next.title} 먹었어요`} accessibilityRole="button" disabled={next.pending} onPress={() => props.onStatusChange(next.id, 'eaten')} style={[styles.choice, styles.choiceMain, next.pending && styles.off]}>
                  <Text style={[styles.choiceText, styles.choiceMainText]}>먹었어요</Text>
                </Pressable>
              ) : null}
              {next.canSave && !next.allergyBlocked ? (
                <Pressable accessibilityLabel={`${next.title} 다른 메뉴`} accessibilityRole="button" disabled={next.regenerating} onPress={() => props.onAlternative(next.id)} style={[styles.choice, next.regenerating && styles.off]}>
                  <Text style={styles.choiceText}>{next.regenerating ? '찾는 중…' : '다른 메뉴'}</Text>
                </Pressable>
              ) : null}
              {props.showRecordControls && next.canSave ? (
                <Pressable accessibilityLabel={`${next.title} 다른 음식 기록`} accessibilityRole="button" disabled={next.pending} onPress={() => props.onRecord(next.id)} style={[styles.choice, next.pending && styles.off]}>
                  <Text style={styles.choiceText}>다른 음식 기록</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : line ? (
          <Text style={styles.line}>{line}</Text>
        ) : null}

        <View style={styles.week}>
          {/* last week / this week; the days that open stay today ±6 */}
          <Pressable
            accessibilityLabel="지난주"
            accessibilityRole="button"
            accessibilityState={{ disabled: week[0].offset <= -6 }}
            disabled={week[0].offset <= -6}
            hitSlop={8}
            onPress={() => props.onSelectDateOffset(props.selectedDateOffset - 7)}
            style={[styles.weekArrow, week[0].offset <= -6 && styles.off]}
          >
            <CaretLeftIcon color={colors.textPrimary} height={16} width={16} />
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
                style={[styles.day, disabled && styles.off]}
              >
                <Text style={styles.dayName}>{weekdays[date.getDay()]}</Text>
                <View style={[styles.dayDot, offset === 0 && styles.dayToday, selected && styles.daySelected]}>
                  <Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>{date.getDate()}</Text>
                </View>
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
            <CaretRightIcon color={colors.textPrimary} height={16} width={16} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.meter}>
            <View style={[styles.meterAte, { width: `${eatenRatio}%` }]} />
            <View style={[styles.meterPlan, { width: `${plannedRatio}%` }]} />
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <Text style={styles.small}>먹은 것</Text>
              <Text style={styles.legendValue}>
                {number(eaten)}
                <Text style={styles.unit}>kcal</Text>
              </Text>
            </View>
            {planned > 0 ? (
              <View style={styles.legendItem}>
                <Text style={styles.small}>예정</Text>
                <Text style={styles.legendValue}>
                  {number(planned)}
                  <Text style={styles.unit}>kcal</Text>
                </Text>
              </View>
            ) : null}
            <View style={styles.legendItem}>
              <Text style={styles.small}>
                {eaten != null && target ? `목표의 ${Math.round((eaten / target) * 100)}%` : '목표'}
              </Text>
              <Text style={styles.legendValue}>
                {number(target)}
                <Text style={styles.unit}>kcal</Text>
              </Text>
            </View>
          </View>
          <View style={styles.macros}>
            {macros.map((goal) => {
              const ratio =
                goal.current != null && goal.target ? Math.min(100, (goal.current / goal.target) * 100) : 0;
              return (
                <View key={goal.label} style={styles.macro}>
                  <Text style={styles.small}>{goal.label}</Text>
                  <Text style={styles.macroValue}>
                    {number(goal.current)} / {number(goal.target)}
                    {goal.unit}
                  </Text>
                  <View style={styles.macroTrack}>
                    <View style={[styles.macroFill, { width: `${ratio}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
          {props.hasUnknownItems ? (
            <Text style={styles.hint}>영양 정보가 없는 음식은 합계에서 제외됐어요.</Text>
          ) : null}
          {/* over today's goal: made up tomorrow, only on the day itself */}
          {props.onAdjust && isToday && ((overBy ?? 0) > 0 || (eaten != null && target && eaten > target && overBy != null)) ? (
            (overBy ?? 0) > 0 ? (
              <View style={styles.overRow}>
                <Text style={styles.overText}>
                  목표보다 {number(overBy)}kcal 더 먹었어요{props.burned ? ` (운동 ${number(props.burned)}kcal 빼고)` : ''}
                </Text>
                <Pressable accessibilityRole="button" onPress={props.onAdjust} style={styles.actionMain}>
                  <Text style={styles.actionMainText}>내일 맞추기</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.why}>운동으로 {number(props.burned)}kcal를 써서 오늘 목표 안이에요.</Text>
            )
          ) : null}
          {props.nutritionError ? (
            <Pressable accessibilityRole="button" onPress={props.onRetryNutrition}>
              <Text style={styles.retry}>{props.nutritionError} · 다시 시도</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" hitSlop={8} onPress={props.onOpenProteinGuide} style={styles.linkRight}>
            <Text style={styles.link}>단백질 가이드</Text>
            <CaretRightIcon color={colors.textPrimary} height={14} width={14} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.mealHead}>
            <Text style={styles.cardTitle}>{isToday ? '오늘 식단' : '선택한 날 식단'}</Text>
            {props.showRecordControls ? (
              <Pressable
                accessibilityLabel="사진으로 기록하기"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canRecordPhoto }}
                disabled={!canRecordPhoto}
                onPress={() => setPickerOpen(true)}
                style={[styles.round, !canRecordPhoto && styles.off]}
              >
                <CameraIcon color={colors.textPrimary} height={20} width={20} />
              </Pressable>
            ) : null}
          </View>
          {/* beside the title they pushed it onto two lines on a phone, so they get their own row */}
          <View style={styles.mealLinks}>
            {props.onMenuStyle && isToday ? (
              <Pressable
                accessibilityLabel="건강식 위주와 일반식 위주 중 고르기"
                accessibilityRole="button"
                hitSlop={8}
                onPress={props.onMenuStyle}
                style={styles.action}
              >
                <Text style={styles.actionText}>{menuStyleLabel(props.menuStyle)}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" hitSlop={8} onPress={props.onOpenWeekly} style={styles.linkInline}>
              <Text style={styles.link}>7일 식단</Text>
              <CaretRightIcon color={colors.textPrimary} height={14} width={14} />
            </Pressable>
          </View>
          {props.showRecordControls && !canRecordPhoto ? (
            <Text style={styles.hint}>
              {props.selectedDateOffset < 0
                ? '지난 날짜의 사진 기록은 아직 지원하지 않아요'
                : '오늘의 추천 식단을 불러오면 사진으로 기록할 수 있어요'}
            </Text>
          ) : null}
          {props.mealsLoading ? <Text style={styles.state}>식단을 불러오고 있어요.</Text> : null}
          {props.mealsError ? (
            <Pressable accessibilityRole="button" onPress={props.onRetryMeals}>
              <Text style={styles.state}>{props.mealsError}</Text>
              <Text style={styles.retry}>다시 시도</Text>
            </Pressable>
          ) : null}
          {!props.mealsLoading && !props.mealsError && props.meals.length === 0 ? (
            props.onMakeWeek ? (
              <Pressable accessibilityRole="button" onPress={props.onMakeWeek} style={styles.actionMain}>
                <Text style={styles.actionMainText}>이번 주 식단 짜기</Text>
              </Pressable>
            ) : (
              <Text style={styles.state}>이 날짜에 추천된 식단이 없어요.</Text>
            )
          ) : null}
          {props.meals.length > 0 ? (
            <View>
              {props.meals.map((meal, index) => {
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
                    style={[main ? styles.actionMain : styles.action, disabled && styles.off]}
                  >
                    <Text style={main ? styles.actionMainText : styles.actionText}>{label}</Text>
                  </Pressable>
                );
                return (
                  <View key={meal.id} style={index > 0 && styles.mealLine}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      onPress={() => setOpenId(open ? null : meal.id)}
                      style={styles.meal}
                    >
                      <Text style={styles.mealSlot}>{meal.title}</Text>
                      <Text numberOfLines={open ? undefined : 1} style={styles.mealName}>
                        {meal.foods}
                      </Text>
                      {recorded ? (
                        <Text style={styles.mealKcal}>
                          {meal.kcal == null ? '기록' : number(meal.kcal)}
                          {meal.kcal == null ? null : <Text style={styles.unit}>kcal</Text>}
                        </Text>
                      ) : (
                        <Text style={styles.mealSoon}>
                          {meal.status === 'skipped'
                            ? '건너뜀'
                            : meal.kcal == null
                              ? '예정'
                              : `${number(meal.kcal)}kcal 예정`}
                        </Text>
                      )}
                    </Pressable>
                    {open ? (
                      <View style={styles.mealOpen}>
                        {meal.photoUrl ? <Image source={{ uri: meal.photoUrl }} style={styles.photo} /> : null}
                        {meal.detail ? <Text style={styles.small}>{meal.detail}</Text> : null}
                        {meal.allergyWarning ? (
                          <Text
                            accessibilityRole={meal.allergyBlocked ? 'alert' : undefined}
                            style={meal.allergyBlocked ? styles.blocked : styles.why}
                          >
                            {meal.allergyWarning}
                          </Text>
                        ) : null}
                        {recommended && meal.note ? <Text style={styles.why}>{meal.note}</Text> : null}
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
          ) : null}
        </View>
        {/* this week: what was eaten each day against the day's goal, the dashed line */}
        {props.week && weekTop > 0 ? (
          <View style={styles.card}>
            <View style={styles.mealHead}>
              <Text style={styles.cardTitle}>이번 주</Text>
              {weekTarget ? <Text style={styles.small}>하루 목표 {number(weekTarget)}kcal</Text> : null}
            </View>
            <View style={styles.plot}>
              {weekTarget ? (
                <View pointerEvents="none" style={[styles.goalLine, { bottom: Math.round((weekTarget / weekTop) * PLOT) }]}>
                  <Svg height={2} width="100%">
                    <Line stroke={colors.textSecondary} strokeDasharray="5 4" strokeWidth={2} x1="0" x2="100%" y1="1" y2="1" />
                  </Svg>
                </View>
              ) : null}
              {props.week.map((day) => {
                const height = day.kcal ? Math.max(4, Math.round((day.kcal / weekTop) * PLOT)) : 0;
                return (
                  <View accessibilityLabel={`${day.date} ${day.kcal == null ? '기록 없음' : `${number(day.kcal)}킬로칼로리`}`} accessible key={day.date} style={styles.col}>
                    {height ? <Text numberOfLines={1} style={styles.barNumber}>{number(day.kcal)}</Text> : null}
                    {height ? <View style={[styles.bar, { height }, day.date === props.selectedDateKey && styles.barOn]} /> : null}
                  </View>
                );
              })}
            </View>
            <View style={styles.barLabels}>
              {props.week.map((day, index) => (
                <Text key={day.date} style={[styles.small, styles.barLabel, day.date === todayKey && styles.barLabelNow]}>
                  {day.date === todayKey ? '오늘' : WEEKDAYS[index]}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <AppBottomSheet onClose={() => setPickerOpen(false)} title="어느 끼니를 기록할까요?" visible={pickerOpen}>
        <View style={styles.picker}>
          {mealLabels.map(({ id, title }, index) => {
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
                style={[styles.pickerRow, index > 0 && styles.mealLine, !available && styles.off]}
              >
                <Text style={styles.pickerText}>
                  {title}
                  {available ? '' : ' · 추천 없음'}
                </Text>
                <CaretRightIcon color={colors.textDisabled} height={16} width={16} />
              </Pressable>
            );
          })}
        </View>
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, paddingHorizontal: 24, width: '100%' },
    hero: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    heroText: { flex: 1, minWidth: 0 },
    by: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: -4 },
    face: { borderColor: colors.border, borderRadius: 15, borderWidth: 1.5 },
    byText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13, lineHeight: 18 },
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 4, paddingHorizontal: 20, paddingVertical: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 22 },
    aiFacts: { color: colors.onAiMuted, fontSize: 12.5, lineHeight: 18 },
    aiWarn: { color: colors.aiHello, fontSize: 12.5, lineHeight: 18 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    choice: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 40, paddingHorizontal: 15 },
    choiceMain: { backgroundColor: colors.lilac },
    choiceText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    choiceMainText: { color: colors.lilacInk, fontFamily: fontFamilies.pretendardExtraBold },
    line: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 15,
      lineHeight: 22,
      marginTop: -4,
    },
    off: { opacity: 0.4 },

    week: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    weekArrow: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', width: 22 },
    overRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingTop: 14 },
    overText: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },
    plot: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', height: PLOT + 20 },
    col: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
    bar: { backgroundColor: colors.surfaceMuted, borderTopLeftRadius: 6, borderTopRightRadius: 6, width: 18 },
    barOn: { backgroundColor: colors.textPrimary },
    barNumber: { backgroundColor: colors.surface, color: colors.textSecondary, fontSize: 10, lineHeight: 14, paddingHorizontal: 2 },
    goalLine: { left: 0, position: 'absolute', right: 0 },
    barLabels: { flexDirection: 'row' },
    barLabel: { flex: 1, textAlign: 'center' },
    barLabelNow: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    day: { alignItems: 'center', gap: 4, minWidth: 36 },
    dayName: { color: colors.textSecondary, fontSize: 11.5, lineHeight: 16 },
    dayDot: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 18,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    dayToday: { borderColor: colors.now, borderWidth: 2 },
    daySelected: { backgroundColor: colors.textPrimary },
    dayNumber: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    dayNumberSelected: { color: colors.onPrimary },

    card: { backgroundColor: colors.surface, borderRadius: 28, gap: 14, paddingHorizontal: 22, paddingVertical: 20 },
    cardTitle: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    unit: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    meter: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 7,
      flexDirection: 'row',
      height: 14,
      overflow: 'hidden',
    },
    meterAte: { backgroundColor: colors.textPrimary, height: 14 },
    // What the app has planned but I have not eaten yet: lilac, the colour of the AI's own work.
    meterPlan: { backgroundColor: colors.lilac, height: 14 },
    legend: { flexDirection: 'row', justifyContent: 'space-between' },
    legendItem: { gap: 1 },
    legendValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 17, lineHeight: 24 },
    macros: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 14, paddingTop: 14 },
    macro: { flex: 1, gap: 4, minWidth: 0 },
    macroValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    macroTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 6, overflow: 'hidden' },
    macroFill: { backgroundColor: colors.textPrimary, borderRadius: 3, height: 6 },
    hint: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    retry: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 19 },
    linkRight: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 4 },
    linkInline: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    link: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 19 },

    mealHead: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 40 },
    mealLinks: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: -6 },
    round: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    state: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
    mealLine: { borderTopColor: colors.border, borderTopWidth: 1 },
    meal: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 56, paddingVertical: 10 },
    mealSlot: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, width: 30 },
    mealName: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 21 },
    mealKcal: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 15, lineHeight: 21 },
    mealSoon: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    mealOpen: { gap: 10, paddingBottom: 14, paddingLeft: 40 },
    photo: { borderRadius: 16, height: 120, width: '100%' },
    why: { color: colors.textPrimary, fontSize: 13.5, lineHeight: 20 },
    blocked: { color: colors.danger, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    action: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: 14,
    },
    actionText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    actionMain: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: 16,
    },
    actionMainText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 13, lineHeight: 18 },

    picker: { paddingBottom: 8 },
    pickerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 56 },
    pickerText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 22 },
  } as const;
}
