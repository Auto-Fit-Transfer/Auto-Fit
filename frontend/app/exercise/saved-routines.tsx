import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSavedWorkoutRoutines, type SavedWorkoutRoutine } from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
type Filter = 'all' | 'recommendation' | 'custom';

export default function SavedRoutines() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<SavedWorkoutRoutine[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    if (retry > 0) setError('');
    void getSavedWorkoutRoutines()
      .then((response) => { if (active) { setRows(response.routines ?? []); setError(''); } })
      .catch((cause) => { if (active) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  useFocusEffect(load);
  const shown = filter === 'all' ? rows : rows.filter((row) => row.source_type === filter);

  return <View style={styles.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>내 운동</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="루틴 만들기" onPress={() => router.push('/exercise/routine-builder')}><Text style={styles.headerAction}>만들기</Text></Pressable>
      </View>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} onPress={() => router.replace('/exercise/history')} style={styles.tab}><Text style={styles.tabText}>운동 기록</Text></Pressable>
        <View style={[styles.tab, styles.tabActive]}><Text style={styles.tabTextActive}>저장한 운동</Text></View>
      </View>
      <Text style={styles.subtitle}>저장한 운동 {rows.length}개</Text>
      <View style={styles.filters}>
        {([['all', '전체'], ['recommendation', '추천 운동'], ['custom', '내 루틴']] as const).map(([key, label]) =>
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.chip, filter === key && styles.chipActive]}>
            <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>{label}</Text>
          </Pressable>)}
      </View>
      {loading ? <ActivityIndicator color={purple} /> : error ? <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> :
        shown.length === 0 ? <View style={styles.card}><Text style={styles.body}>저장한 운동이 없어요. 운동 기록에서 추천 운동을 저장하거나 루틴을 만들어 보세요.</Text></View> :
          shown.map((routine) => {
            const open = expanded === routine.user_workout_routine_id;
            return <View key={routine.user_workout_routine_id} style={styles.card}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : routine.user_workout_routine_id)}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>{routine.name}</Text><Text style={styles.arrow}>{open ? '⌃' : '⌄'}</Text></View>
                <Text style={styles.meta}>{routine.source_type === 'custom' ? '내 루틴' : '추천 운동'} · {routine.items.length}개 운동</Text>
              </Pressable>
              {open ? <View style={styles.itemList}>{routine.items.map((item) =>
                <View key={item.user_workout_routine_item_id} style={styles.item}>
                  <Text style={styles.itemNumber}>{item.sequence_order}</Text>
                  <View style={{ flex: 1 }}><Text style={styles.body}>{item.exercise_name}</Text><Text style={styles.meta}>{[item.sets && `${item.sets}세트`, item.repetitions && `${item.repetitions}회`, item.target_duration_seconds && `${Math.round(item.target_duration_seconds / 60)}분`].filter(Boolean).join(' · ') || '운동 정보 없음'}</Text></View>
                </View>)}</View> : null}
            </View>;
          })}
      <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/routine-builder')} style={styles.button}><Text style={styles.buttonText}>새 루틴 만들기</Text></Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { paddingHorizontal: 20, gap: 17 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 32, color: '#1E1D24', lineHeight: 36 },
  title: { fontSize: 18, color: '#1E1D24', fontFamily: fontFamilies.pretendardBold },
  headerAction: { color: '#1E1D24', fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  tabs: { flexDirection: 'row', backgroundColor: '#F0F1F3', borderRadius: 13, padding: 4 },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { color: '#777681', fontSize: 13 },
  tabTextActive: { color: '#1E1D24', fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  subtitle: { color: '#777681', fontSize: 13 },
  filters: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  chipActive: { backgroundColor: purple, borderColor: purple },
  chipText: { fontSize: 12, color: '#777681' },
  chipTextActive: { color: '#FFF' },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 15, padding: 16, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#1E1D24', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  arrow: { color: purple, fontSize: 19 },
  meta: { color: '#777681', fontSize: 12, marginTop: 4 },
  body: { color: '#1E1D24', fontSize: 13, lineHeight: 19 },
  itemList: { borderTopWidth: 1, borderTopColor: '#E4E5EB', paddingTop: 8, gap: 12 },
  item: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  itemNumber: { color: purple, fontSize: 13, fontFamily: fontFamilies.pretendardBold },
  button: { backgroundColor: purple, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#FFF', fontSize: 15, fontFamily: fontFamilies.pretendardBold },
  error: { color: '#A13A2F', fontSize: 13 },
});
