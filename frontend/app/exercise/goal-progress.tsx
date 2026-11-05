import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { koreanDate } from '@/src/lib/koreanDate';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getActiveExerciseGoal, getExerciseHistory } from '@/src/api/exercise';
import { getRunningApiErrorMessage, getRunningHistory } from '@/src/api/running';
import { getApiErrorMessage } from '@/src/api/client';
import { chartActivity, chartTop, collectActivityDays, localDayKey, shiftDay, summarizeActivity, type ActivityDay } from '@/src/features/exercise/goalProgress';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

type Goal = { goal_type: string; weekly_frequency: number; weekly_duration_minutes: number; starts_on: string; ends_on: string };
type Period = 'week' | 'month';
type Metric = 'minutes' | 'workouts' | 'runningMinutes';
const goalLabels: Record<string, string> = {
  muscle_gain: '근육량 늘리기', weight_loss: '체중 감량하기',
  endurance: '체력 기르기', maintenance: '꾸준히 운동하기',
  rehabilitation: '무리 없이 회복하기',
};
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const PLOT_HEIGHT = 136;
const BAR_WIDTH = 22;

export default function GoalProgress() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<Metric>('minutes');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [days, setDays] = useState<ActivityDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const today = useMemo(() => new Date(), []);
  const currentStart = useMemo(() => {
    if (period === 'week') return shiftDay(today, -((today.getDay() + 6) % 7) + offset * 7);
    return new Date(today.getFullYear(), today.getMonth() + offset, 1, 12);
  }, [today, period, offset]);
  const currentEnd = useMemo(() => period === 'week'
    ? shiftDay(currentStart, 6)
    : new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0, 12), [currentStart, period]);
  const span = Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1;
  const previousStart = shiftDay(currentStart, -span);
  const previousEnd = shiftDay(currentStart, -1);
  const historyFrom = localDayKey(shiftDay(previousStart, -1));
  const historyTo = localDayKey(shiftDay(currentEnd, 1));

  useEffect(() => {
    let active = true;
    void Promise.all([
      getActiveExerciseGoal(),
      getExerciseHistory(historyFrom, historyTo),
      getRunningHistory(historyFrom, historyTo),
    ]).then(([goalResponse, exerciseResponse, runningResponse]) => {
      if (!active) return;
      setGoal((goalResponse.goal ?? null) as Goal | null);
      setDays(collectActivityDays(exerciseResponse.history ?? [], runningResponse.sessions ?? []));
      setError('');
    }).catch((cause) => {
      if (active) setError(getRunningApiErrorMessage(cause) || getApiErrorMessage(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [historyFrom, historyTo, retry]);

  const summary = summarizeActivity(days, currentStart, currentEnd);
  const previous = summarizeActivity(days, previousStart, previousEnd);
  const bars = chartActivity(days, currentStart, currentEnd, period);
  const target = goal ? metric === 'minutes'
    ? goal.weekly_duration_minutes * (period === 'week' ? 1 : Math.ceil(span / 7))
    : metric === 'workouts'
      ? goal.weekly_frequency * (period === 'week' ? 1 : Math.ceil(span / 7))
      : null : null;
  const value = summary[metric];
  const difference = value - previous[metric];
  const percent = target ? Math.min(100, Math.max(0, value / target * 100)) : 0;
  const unit = metric === 'workouts' ? '회' : '분';
  const week = period === 'week';
  // A week's bars are days and a month's bars are weeks, so the line shows the goal for one bar. A day's share of a few workouts is not a useful line.
  const lineValue = !goal ? null
    : metric === 'minutes' ? goal.weekly_duration_minutes / (week ? 7 : 1)
      : metric === 'workouts' && !week ? goal.weekly_frequency : null;
  const top = chartTop(Math.max(lineValue ?? 0, ...bars.map((bar) => bar[metric])), metric === 'workouts' ? 2 : 30);
  const todayIndex = week && offset === 0 ? (today.getDay() + 6) % 7 : -1;
  const change = Math.round(difference);
  const remaining = target ? Math.max(0, Math.ceil(target - value)) : 0;
  const before = offset === 0 ? (week ? '지난주' : '지난달') : (week ? '전주' : '전달');
  const axisWidth = simple || preferences.font_size_step > 3 ? 44 : 34;
  const bestDay = summary.bestDay;
  const bestLabel = !bestDay ? '—'
    : `${week ? `${weekdays[new Date(`${bestDay.date}T12:00:00`).getDay()]} · ` : ''}${Math.round(bestDay.minutes)}분`;

  return <View style={styles.root}>
    <ScreenHeader onBack={() => router.back()} title="진행 현황" right={<SimpleReadButton text={`${period === 'week' ? '주간' : '월간'} 운동 진행 현황입니다. ${Math.round(summary.minutes)}분 운동했고 ${summary.workouts}회 완료했어요. 목표까지 남은 양을 화면에서 확인하세요.`} />} />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 38 }]}>
      <View style={styles.segment}>{([['week', '주간'], ['month', '월간']] as const).map(([key, label]) =>
        <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: period === key }} onPress={() => { if (period !== key || offset !== 0) setLoading(true); setPeriod(key); setOffset(0); }} style={[styles.segmentChoice, period === key && styles.segmentSelected]}><Text style={[styles.segmentText, period === key && styles.segmentTextSelected]}>{label}</Text></Pressable>)}</View>
      <View style={styles.dateRow}>
        <Pressable hitSlop={18} accessibilityRole="button" accessibilityLabel="이전 기간" onPress={() => { setLoading(true); setOffset((value) => value - 1); }}><CaretLeftIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
        <Text style={styles.dateTitle}>{koreanDate(currentStart)} – {koreanDate(currentEnd)}</Text>
        <Pressable hitSlop={18} accessibilityRole="button" accessibilityLabel="다음 기간" disabled={offset >= 0} onPress={() => { setLoading(true); setOffset((value) => value + 1); }}><CaretRightIcon color={offset >= 0 ? colors.textDisabled : colors.textPrimary} height={24} width={24} /></Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.primaryText} /> : error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> : <>
        <View style={styles.goalRow}><View><Text style={styles.goalName}>{goal ? goalLabels[goal.goal_type] ?? '운동 목표' : '설정한 목표가 없어요'}</Text><Text style={styles.caption}>{goal ? `${koreanDate(goal.starts_on)} – ${koreanDate(goal.ends_on)}` : '목표를 만들면 진행 상황을 비교할 수 있어요.'}</Text></View><Pressable accessibilityRole="button" onPress={() => router.push('/exercise/goal')} style={styles.outline}><Text style={styles.outlineText}>{goal ? '목표 바꾸기' : '목표 설정'}</Text></Pressable></View>
        <View style={styles.tabs}>{([['minutes', '운동 시간'], ['workouts', '운동 횟수'], ['runningMinutes', '러닝 시간']] as const).map(([key, label]) =>
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: metric === key }} onPress={() => setMetric(key)} style={[styles.tab, metric === key && styles.selectedTab]}><Text style={[styles.tabText, metric === key && styles.selectedTabText]}>{label}</Text></Pressable>)}</View>
        <View style={[styles.card, simple && simpleStyles.card]}>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>{offset === 0 ? '이번' : '그'} {week ? '주' : '달'} {metric === 'workouts' ? '운동 횟수' : metric === 'runningMinutes' ? '러닝 시간' : '운동 시간'}</Text>
            <View style={[styles.deltaPill, change > 0 && styles.deltaPillUp]}>
              {change > 0 ? <CheckIcon color={colors.success} height={14} width={14} /> : null}
              <Text style={[styles.delta, change > 0 && styles.deltaUp]}>{change === 0 ? `${before}${week ? '와' : '과'} 같아요` : `${before}보다 ${change > 0 ? '+' : '−'}${Math.abs(change)}${unit}`}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={[styles.bigNumber, simple && simpleStyles.bigNumber]}>{Math.round(value)}{unit}{target ? <Text style={styles.target}> / 목표 {Math.round(target)}{unit}</Text> : null}</Text>
            {target ? <Text style={styles.remaining}>{remaining > 0 ? `${remaining}${unit} 남음` : '목표 달성'}</Text> : null}
          </View>
          {target ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View> : null}
          <View style={styles.chart}>
            <View style={[styles.plot, { marginLeft: axisWidth }]}>
              {[1, 0.5, 0].map((ratio) => <View key={ratio} style={[styles.gridLine, { bottom: ratio * PLOT_HEIGHT }]}><Text numberOfLines={1} style={[styles.axisLabel, { left: -axisWidth, width: axisWidth - 4 }]}>{ratio ? `${top * ratio}${unit}` : '0'}</Text></View>)}
              <View style={styles.columns}>{bars.map((bar, index) => {
                const amount = bar[metric];
                const height = amount > 0 ? Math.max(BAR_WIDTH, amount / top * PLOT_HEIGHT) : 0;
                return <View key={bar.label} style={styles.column}>
                  <View style={[styles.barTrack, index === todayIndex && styles.barTrackToday]}><View accessibilityLabel={`${bar.label} ${Math.round(amount)}${unit}`} style={[styles.bar, { height }]} /></View>
                  {amount > 0 ? <Text numberOfLines={1} style={[styles.barValue, { bottom: height + 2 }]}>{Math.round(amount)}{unit}</Text> : index === todayIndex ? <Text style={[styles.barValue, { bottom: PLOT_HEIGHT + 2 }]}>오늘</Text> : null}
                </View>;
              })}</View>
              {lineValue ? <View pointerEvents="none" style={[styles.goalLine, { bottom: lineValue / top * PLOT_HEIGHT }]}>
                <Svg height={2} width="100%"><Line stroke={colors.primary} strokeDasharray="4 4" strokeWidth={1.5} x1="0" x2="100%" y1="1" y2="1" /></Svg>
                <View style={styles.goalTag}><Text style={styles.goalTagText}>{week ? '하루' : '주'} 목표 {Math.round(lineValue)}{unit}</Text></View>
              </View> : null}
            </View>
            <View style={[styles.dayLabels, { marginLeft: axisWidth }]}>{bars.map((bar, index) => <Text key={bar.label} style={[styles.barLabel, index === todayIndex && styles.barLabelToday]}>{bar.label}</Text>)}</View>
          </View>
          <View style={[styles.stats, simple && simpleStyles.stats]}>{[
            ['운동한 날', `${summary.activeDays}일`],
            ['운동한 날 평균', `${summary.activeDays ? Math.round(summary.minutes / summary.activeDays) : 0}분`],
            ['가장 많이 한 날', bestLabel],
          ].map(([label, stat]) => <View key={label} style={[styles.stat, !simple && styles.statInRow]}><Text style={styles.caption}>{label}</Text><Text style={styles.statValue}>{stat}</Text></View>)}</View>
        </View>
        <View style={styles.card}><Text style={styles.sectionTitle}>{summary.workouts ? '이번 기간에도 운동을 이어가고 있어요' : '첫 운동 기록을 기다리고 있어요'}</Text><Text style={styles.caption}>{summary.workouts ? `${summary.workouts}회 운동했고, 연속 운동은 최대 ${summary.longestStreak}일이에요.` : '운동을 마치면 실제 기록을 이곳에서 확인할 수 있어요.'}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/condition')} style={styles.button}><Text style={styles.buttonText}>운동 추천받기</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, gap: 17 },
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: 24, padding: 3 }, segmentChoice: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999 }, segmentSelected: { backgroundColor: colors.background }, segmentText: { color: colors.textSecondary, fontSize: 14 }, segmentTextSelected: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dateTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, goalName: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold }, caption: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 }, outline: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, justifyContent: 'center', minHeight: 34, paddingHorizontal: 12 }, outlineText: { color: colors.textPrimary, fontSize: 14 },
    tabs: { flexDirection: 'row', gap: 6 }, tab: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9 }, selectedTab: { backgroundColor: colors.primary, borderColor: colors.primary }, tabText: { color: colors.textSecondary, fontSize: 14 }, selectedTabText: { color: '#FFF' },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, deltaPill: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }, deltaPillUp: { backgroundColor: colors.successLight }, delta: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 }, deltaUp: { color: colors.success },
    bigNumber: { color: colors.textPrimary, fontSize: 22, fontFamily: fontFamilies.pretendardBold }, target: { color: colors.textSecondary, fontSize: 14 }, remaining: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.gaugeTrack, overflow: 'hidden' }, progressFill: { height: 8, backgroundColor: colors.gaugeFill },
    chart: { paddingTop: 22 }, plot: { height: PLOT_HEIGHT },
    gridLine: { backgroundColor: colors.border, height: 1, left: 0, position: 'absolute', right: 0 }, axisLabel: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, position: 'absolute', top: -8 },
    columns: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0 }, column: { alignItems: 'center', flex: 1, height: PLOT_HEIGHT },
    barTrack: { backgroundColor: colors.gaugeTrack, borderRadius: BAR_WIDTH / 2, height: PLOT_HEIGHT, justifyContent: 'flex-end', overflow: 'hidden', width: BAR_WIDTH }, barTrackToday: { borderColor: colors.textPrimary, borderStyle: 'dashed', borderWidth: 1 }, bar: { backgroundColor: colors.textPrimary, borderRadius: BAR_WIDTH / 2, width: '100%' },
    barValue: { color: colors.textPrimary, fontSize: 12, left: -8, lineHeight: 17, position: 'absolute', right: -8, textAlign: 'center' },
    goalLine: { height: 2, left: 0, position: 'absolute', right: 0 }, goalTag: { backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: 6, position: 'absolute', right: 30, top: -8 }, goalTagText: { color: colors.primaryText, fontSize: 12, lineHeight: 17 },
    dayLabels: { flexDirection: 'row', marginTop: 8 }, barLabel: { color: colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 21, textAlign: 'center' }, barLabelToday: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    stats: { flexDirection: 'row', gap: 8 }, stat: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 4, padding: 12 }, statInRow: { flex: 1 }, statValue: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, button: { backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold }, error: { color: colors.danger, fontSize: 14 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  card: { padding: 21 },
  bigNumber: {},
  stats: { flexDirection: 'column' },
});
