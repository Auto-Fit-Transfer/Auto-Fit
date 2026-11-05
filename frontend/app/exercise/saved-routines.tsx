import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getSavedWorkoutRoutines, type SavedWorkoutRoutine } from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

type Filter = 'all' | 'recommendation' | 'custom';

export default function SavedRoutines() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
    <ScreenHeader onBack={() => router.back()} title="내 운동" right={<Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="루틴 만들기" onPress={() => router.push('/exercise/routine-builder')}><Text style={styles.headerAction}>만들기</Text></Pressable>} />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 40 }]}>
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
      {loading ? <ActivityIndicator color={colors.primaryText} /> : error ? <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> :
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

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, gap: 17 },
    headerAction: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    tabs: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 4 },
    tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    tabActive: { backgroundColor: colors.background },
    tabText: { color: colors.textSecondary, fontSize: 14 },
    tabTextActive: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    subtitle: { color: colors.textSecondary, fontSize: 14 },
    filters: { flexDirection: 'row', gap: 8 },
    chip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 14, color: colors.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 10 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    arrow: { color: colors.textPrimary, fontSize: 19 },
    meta: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
    body: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    itemList: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 12 },
    item: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    itemNumber: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold },
    button: { backgroundColor: colors.primary, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
    buttonText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    error: { color: colors.danger, fontSize: 14 },
  } as const;
}
