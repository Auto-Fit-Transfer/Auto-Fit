import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExerciseHistory, saveRecommendedWorkout } from '@/src/api/exercise';
import { getRunningApiErrorMessage, getRunningHistory, type RunningSession } from '@/src/api/running';
import { getApiErrorMessage } from '@/src/api/client';
import { sessionLocalDate, sessionMinutes } from '@/src/features/exercise/weeklyMetrics';
import { fontFamilies } from '@/src/theme';

type HistoryRow = Awaited<ReturnType<typeof getExerciseHistory>>['history'][number];
const purple = '#503DD7';
const ink = '#1E1D24';
const muted = '#777681';
const border = '#E4E5EB';
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const number = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function ExerciseHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [runningRows, setRunningRows] = useState<RunningSession[]>([]);
  const [runningLoading, setRunningLoading] = useState(true);
  const [runningError, setRunningError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6 + index);
    return { key: dayKey(date), label: `${date.getMonth() + 1}/${date.getDate()}`, weekday: ['일', '월', '화', '수', '목', '금', '토'][date.getDay()] };
  }), [today]);

  useEffect(() => {
    let active = true;
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    void getExerciseHistory(dayKey(from), dayKey(today))
      .then((response) => { if (active) { setRows(response.history ?? []); setError(''); } })
      .catch((cause) => { if (active) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    void getRunningHistory()
      .then((response) => {
        if (active) {
          setRunningRows((response.sessions ?? []).filter((run) =>
            sessionLocalDate(run.started_at) >= dayKey(from) && sessionLocalDate(run.started_at) <= dayKey(today)));
          setRunningError('');
        }
      })
      .catch((cause) => { if (active) setRunningError(getRunningApiErrorMessage(cause)); })
      .finally(() => { if (active) setRunningLoading(false); });
    return () => { active = false; };
  }, [retry, today]);

  const filtered = selectedDay
    ? rows.filter(({ session }) => sessionLocalDate(session.started_at) === selectedDay)
    : rows;
  const filteredRuns = selectedDay
    ? runningRows.filter((run) => sessionLocalDate(run.started_at) === selectedDay)
    : runningRows;
  const completed = rows.filter(({ session }) => session.status === 'completed');
  const minutes = completed.reduce((total, { session }) => total + (sessionMinutes(session.total_duration_seconds) ?? 0), 0)
    + runningRows.reduce((total, run) => total + number(run.elapsed_seconds) / 60, 0);
  const save = async (session: HistoryRow['session']) => {
    const id = session.exercise_recommendation_id;
    if (typeof id !== 'string' || !id) return;
    setSavingId(id);
    setSaveError('');
    try {
      await saveRecommendedWorkout(id, `${sessionLocalDate(session.started_at)} 운동`);
      setSavedIds((current) => [...current, id]);
    } catch (cause) {
      setSaveError(getApiErrorMessage(cause));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.title}>내 운동</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="루틴 만들기" onPress={() => router.push('/exercise/routine-builder')}><Text style={styles.link}>만들기</Text></Pressable>
        </View>
        <View style={styles.tabs}>
          <View style={[styles.tab, styles.tabActive]}><Text style={styles.tabTextActive}>운동 기록</Text></View>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} onPress={() => router.replace('/exercise/saved-routines')} style={styles.tab}><Text style={styles.tabText}>저장한 운동</Text></Pressable>
        </View>
        <Text style={styles.sectionTitle}>최근 7일</Text>
        <View style={styles.week}>
          {days.map((day) => {
            const count = rows.filter(({ session }) => sessionLocalDate(session.started_at) === day.key).length
              + runningRows.filter((run) => sessionLocalDate(run.started_at) === day.key).length;
            const selected = selectedDay === day.key;
            return <Pressable key={day.key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedDay(selected ? null : day.key)} style={[styles.day, selected && styles.daySelected]}>
              <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day.weekday}</Text>
              <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day.label}</Text>
              <View style={[styles.dayDot, count > 0 && styles.dayDotActive]} />
            </Pressable>;
          })}
        </View>
        <View style={styles.summary}>
          <Text style={styles.sectionTitle}>최근 30일 운동</Text>
          <View style={styles.summaryStats}>
            <View><Text style={styles.statNumber}>{completed.length + runningRows.length}</Text><Text style={styles.caption}>완료 횟수</Text></View>
            <View><Text style={styles.statNumber}>{Math.round(minutes)}</Text><Text style={styles.caption}>운동 시간 · 분</Text></View>
            <View><Text style={styles.statNumber}>{Math.round(completed.reduce((sum, row) => sum + number(row.session.total_calories_burned), 0))}</Text><Text style={styles.caption}>열량 · 러닝 제외</Text></View>
          </View>
        </View>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{selectedDay ? `${selectedDay} 기록` : '운동 내역'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/saved-routines')}><Text style={styles.link}>저장한 운동 ›</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator color={purple} /> : error ? (
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable>
        ) : filtered.length === 0 ? <View style={styles.card}><Text style={styles.body}>이 기간에 기록한 운동이 없어요.</Text></View> : filtered.map(({ session, logs }, index) => {
          const id = typeof session.exercise_recommendation_id === 'string' ? session.exercise_recommendation_id : null;
          const complete = session.status === 'completed';
          return <View key={String(session.exercise_session_id ?? index)} style={styles.card}>
            <View style={styles.sectionRow}><Text style={styles.cardTitle}>{sessionLocalDate(session.started_at)} 운동</Text><Text style={styles.badge}>{complete ? '완료' : '중단'}</Text></View>
            <Text style={styles.body}>{sessionMinutes(session.total_duration_seconds) ?? 0}분 · {number(session.completed_item_count)}개 완료 · {Math.round(number(session.total_calories_burned))}kcal</Text>
            {logs.length > 0 ? <Text style={styles.caption} numberOfLines={2}>{logs.map((log) => typeof log === 'object' && log && 'exercise_name' in log ? String(log.exercise_name) : '').filter(Boolean).join(' · ')}</Text> : null}
            {complete && id ? <Pressable accessibilityRole="button" disabled={savingId === id || savedIds.includes(id)} onPress={() => void save(session)} style={styles.outlineButton}><Text style={styles.outlineText}>{savedIds.includes(id) ? '저장 완료' : savingId === id ? '저장 중…' : '내 루틴으로 저장'}</Text></Pressable> : null}
          </View>;
        })}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <Text style={styles.sectionTitle}>러닝 기록</Text>
        {runningLoading ? <ActivityIndicator color={purple} /> : runningError ? (
          <Pressable accessibilityRole="button" onPress={() => { setRunningLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.error}>{runningError} · 다시 시도</Text></Pressable>
        ) : filteredRuns.length === 0 ? <View style={styles.card}><Text style={styles.body}>이 기간에 완료한 러닝이 없어요.</Text></View> :
          filteredRuns.map((run) => <Pressable key={run.running_session_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/run-result', params: { sessionId: run.running_session_id } })} style={styles.card}>
            <View style={styles.sectionRow}><Text style={styles.cardTitle}>{sessionLocalDate(run.started_at)} 자유 러닝</Text><Text style={styles.link}>결과 보기 ›</Text></View>
            <Text style={styles.body}>{(number(run.distance_meters) / 1000).toFixed(2)}km · {Math.round(number(run.elapsed_seconds) / 60)}분</Text>
          </Pressable>)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { paddingHorizontal: 20, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 40 },
  back: { fontSize: 32, color: ink, lineHeight: 36 },
  title: { fontSize: 18, color: ink, fontFamily: fontFamilies.pretendardBold },
  tabs: { flexDirection: 'row', backgroundColor: '#F0F1F3', borderRadius: 13, padding: 4 },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { color: muted, fontSize: 13 },
  tabTextActive: { color: ink, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  sectionTitle: { fontSize: 17, color: ink, fontFamily: fontFamilies.pretendardBold },
  week: { backgroundColor: '#FFF', borderColor: border, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 8, borderRadius: 10 },
  daySelected: { backgroundColor: purple },
  dayText: { color: muted, fontSize: 12 },
  dayTextSelected: { color: '#FFF' },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dayDotActive: { backgroundColor: '#76CE96' },
  summary: { backgroundColor: '#FFF', borderColor: border, borderWidth: 1, borderRadius: 16, padding: 17, gap: 16 },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-between' },
  statNumber: { color: purple, fontSize: 22, fontFamily: fontFamilies.pretendardBold },
  caption: { color: muted, fontSize: 12, lineHeight: 18 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: purple, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  card: { backgroundColor: '#FFF', borderColor: border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 9 },
  cardTitle: { fontSize: 16, color: ink, fontFamily: fontFamilies.pretendardBold },
  badge: { color: purple, backgroundColor: '#F0EEFC', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, fontSize: 11 },
  body: { color: ink, fontSize: 13, lineHeight: 20 },
  outlineButton: { borderColor: border, borderWidth: 1, borderRadius: 9, height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  outlineText: { color: purple, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  error: { color: '#A13A2F', fontSize: 13 },
});
