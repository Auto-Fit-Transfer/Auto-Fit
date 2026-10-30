import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveExerciseGoal, getExerciseHistory } from '@/src/api/exercise';
import { getRunningApiErrorMessage, getRunningHistory } from '@/src/api/running';
import { getApiErrorMessage } from '@/src/api/client';
import { chartActivity, collectActivityDays, localDayKey, shiftDay, summarizeActivity, type ActivityDay } from '@/src/features/exercise/goalProgress';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { fontFamilies } from '@/src/theme';

type Goal = { goal_type: string; weekly_frequency: number; weekly_duration_minutes: number; starts_on: string; ends_on: string };
type Period = 'week' | 'month';
type Metric = 'minutes' | 'workouts' | 'runningMinutes';
const purple = '#503DD7';
const goalLabels: Record<string, string> = {
  muscle_gain: '근육량 늘리기', weight_loss: '체중 감량하기',
  endurance: '체력 기르기', maintenance: '꾸준히 운동하기',
  rehabilitation: '무리 없이 회복하기',
};
const shortDate = (date: Date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;

export default function GoalProgress() {
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
  const scale = Math.max(1, ...bars.map((bar) => bar[metric]));
  const target = goal ? metric === 'minutes'
    ? goal.weekly_duration_minutes * (period === 'week' ? 1 : Math.ceil(span / 7))
    : metric === 'workouts'
      ? goal.weekly_frequency * (period === 'week' ? 1 : Math.ceil(span / 7))
      : null : null;
  const value = summary[metric];
  const difference = value - previous[metric];
  const percent = target ? Math.min(100, Math.max(0, value / target * 100)) : 0;
  const unit = metric === 'workouts' ? '회' : '분';

  return <View style={styles.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 38 }]}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>진행 현황</Text><SimpleReadButton text={`${period === 'week' ? '주간' : '월간'} 운동 진행 현황입니다. ${Math.round(summary.minutes)}분 운동했고 ${summary.workouts}회 완료했어요. 목표까지 남은 양을 화면에서 확인하세요.`} /></View>
      <View style={styles.segment}>{([['week', '주간'], ['month', '월간']] as const).map(([key, label]) =>
        <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: period === key }} onPress={() => { if (period !== key || offset !== 0) setLoading(true); setPeriod(key); setOffset(0); }} style={[styles.segmentChoice, period === key && styles.segmentSelected]}><Text style={[styles.segmentText, period === key && styles.segmentTextSelected]}>{label}</Text></Pressable>)}</View>
      <View style={styles.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 기간" onPress={() => { setLoading(true); setOffset((value) => value - 1); }}><Text style={styles.arrow}>‹</Text></Pressable>
        <Text style={styles.dateTitle}>{shortDate(currentStart)} – {shortDate(currentEnd)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 기간" disabled={offset >= 0} onPress={() => { setLoading(true); setOffset((value) => value + 1); }}><Text style={[styles.arrow, offset >= 0 && styles.disabled]}>›</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color={purple} /> : error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> : <>
        <View style={styles.goalRow}><View><Text style={styles.goalName}>{goal ? goalLabels[goal.goal_type] ?? '운동 목표' : '설정한 목표가 없어요'}</Text><Text style={styles.caption}>{goal ? `${goal.starts_on} – ${goal.ends_on}` : '목표를 만들면 진행 상황을 비교할 수 있어요.'}</Text></View><Pressable accessibilityRole="button" onPress={() => router.push('/exercise/goal')} style={styles.outline}><Text style={styles.outlineText}>{goal ? '목표 바꾸기' : '목표 설정'}</Text></Pressable></View>
        <View style={styles.tabs}>{([['minutes', '운동 시간'], ['workouts', '운동 횟수'], ['runningMinutes', '러닝 시간']] as const).map(([key, label]) =>
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: metric === key }} onPress={() => setMetric(key)} style={[styles.tab, metric === key && styles.selectedTab]}><Text style={[styles.tabText, metric === key && styles.selectedTabText]}>{label}</Text></Pressable>)}</View>
        <View style={[styles.card, simple && simpleStyles.card]}>
          <View style={styles.row}><Text style={styles.sectionTitle}>이번 {period === 'week' ? '주' : '달'} {metric === 'workouts' ? '운동 횟수' : metric === 'runningMinutes' ? '러닝 시간' : '운동 시간'}</Text><Text style={styles.delta}>{difference === 0 ? '지난 기간과 같아요' : `지난 기간보다 ${Math.abs(Math.round(difference))}${unit} ${difference > 0 ? '늘었어요' : '줄었어요'}`}</Text></View>
          <Text style={[styles.bigNumber, simple && simpleStyles.bigNumber]}>{Math.round(value)}{unit}{target ? <Text style={styles.target}> / 목표 {Math.round(target)}{unit}</Text> : null}</Text>
          {target ? <><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View><Text style={styles.caption}>{value >= target ? '이번 기간 목표를 달성했어요.' : `목표까지 ${Math.max(0, Math.ceil(target - value))}${unit} 남았어요.`}</Text></> : null}
          <View style={styles.chart}>{bars.map((bar) => <View key={bar.label} style={styles.barColumn}><View style={styles.barTrack}><View style={[styles.bar, { height: `${bar[metric] > 0 ? Math.max(5, bar[metric] / scale * 100) : 0}%` }]} accessibilityLabel={`${bar.label} ${Math.round(bar[metric])}${unit}`} /></View><Text style={styles.barLabel}>{bar.label}</Text></View>)}</View>
          <View style={[styles.stats, simple && simpleStyles.stats]}><View><Text style={styles.statValue}>{summary.activeDays}일</Text><Text style={styles.caption}>운동한 날</Text></View><View><Text style={styles.statValue}>{summary.activeDays ? Math.round(summary.minutes / summary.activeDays) : 0}분</Text><Text style={styles.caption}>운동한 날 평균</Text></View><View><Text style={styles.statValue}>{summary.bestDay ? `${Math.round(summary.bestDay.minutes)}분` : '—'}</Text><Text style={styles.caption}>가장 많이 한 날</Text></View></View>
        </View>
        <View style={styles.card}><Text style={styles.sectionTitle}>{summary.workouts ? '이번 기간에도 운동을 이어가고 있어요' : '첫 운동 기록을 기다리고 있어요'}</Text><Text style={styles.caption}>{summary.workouts ? `${summary.workouts}회 운동했고, 연속 운동은 최대 ${summary.longestStreak}일이에요.` : '운동을 마치면 실제 기록을 이곳에서 확인할 수 있어요.'}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/condition')} style={styles.button}><Text style={styles.buttonText}>운동 추천받기</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' }, content: { paddingHorizontal: 20, gap: 17 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { color: '#1E1D24', fontSize: 32, lineHeight: 36 }, title: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  segment: { flexDirection: 'row', backgroundColor: '#EEEFF2', borderRadius: 24, padding: 3 }, segmentChoice: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 20 }, segmentSelected: { backgroundColor: '#FFF' }, segmentText: { color: '#777681', fontSize: 13 }, segmentTextSelected: { color: '#1E1D24', fontFamily: fontFamilies.pretendardSemiBold },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, arrow: { fontSize: 28, color: '#1E1D24' }, disabled: { color: '#C9C9CF' }, dateTitle: { color: '#1E1D24', fontSize: 15, fontFamily: fontFamilies.pretendardBold },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, goalName: { color: '#1E1D24', fontSize: 15, fontFamily: fontFamilies.pretendardBold }, caption: { color: '#777681', fontSize: 11, lineHeight: 17 }, outline: { borderColor: '#E4E5EB', borderWidth: 1, borderRadius: 8, padding: 9 }, outlineText: { color: '#1E1D24', fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 6 }, tab: { borderColor: '#E4E5EB', borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 9 }, selectedTab: { backgroundColor: purple, borderColor: purple }, tabText: { color: '#777681', fontSize: 12 }, selectedTabText: { color: '#FFF' },
  card: { backgroundColor: '#FFF', borderColor: '#E4E5EB', borderWidth: 1, borderRadius: 15, padding: 16, gap: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, delta: { color: '#24835E', fontSize: 10 },
  bigNumber: { color: '#1E1D24', fontSize: 24, fontFamily: fontFamilies.pretendardBold }, target: { color: '#777681', fontSize: 13 }, progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E9E9EE', overflow: 'hidden' }, progressFill: { height: 7, backgroundColor: purple },
  chart: { height: 160, flexDirection: 'row', alignItems: 'flex-end', gap: 5, borderBottomWidth: 1, borderBottomColor: '#E4E5EB' }, barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 7 }, barTrack: { flex: 1, width: '78%', backgroundColor: '#F2F2F5', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' }, bar: { backgroundColor: '#24232A', borderRadius: 7, width: '100%' }, barLabel: { color: '#777681', fontSize: 10, marginBottom: 5 },
  stats: { flexDirection: 'row', justifyContent: 'space-between' }, statValue: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, button: { backgroundColor: purple, borderRadius: 10, height: 50, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, error: { color: '#A13A2F', fontSize: 13 },
});

const simpleStyles = StyleSheet.create({
  card: { padding: 21 },
  bigNumber: { fontSize: 30 },
  stats: { flexDirection: 'column', gap: 14 },
});
