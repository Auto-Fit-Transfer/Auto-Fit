import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import { getApiErrorMessage } from '@/src/api/client';
import {
  completeExerciseSession,
  getExerciseApiErrorMessage,
  getLatestSavedRoutineSession,
  getSavedWorkoutRoutines,
  startSavedRoutine,
  type SavedWorkoutRoutine,
} from '@/src/api/exercise';
import { aForm } from '@/src/components/a/form';
import { ALoading } from '@/src/components/a/ALoading';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { savedRoutineRun } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// My saved routines: the recommended ones I kept and the ones I made. What it reads is unchanged. The record
// is no longer a tab beside it: it has its own door (운동 기록) in the exercise tab and the report.
type Filter = 'all' | 'recommendation' | 'custom';
const FILTERS: [Filter, string][] = [['all', '전체'], ['recommendation', '추천 운동'], ['custom', '내 루틴']];

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
  const [starting, setStarting] = useState<string | null>(null);
  const { beginSession } = useExerciseSession();

  // Starts (or, after the app was closed, picks up) a saved routine as its own session (back-end fc0bd14).
  const start = async (routine: SavedWorkoutRoutine) => {
    if (starting) return;
    setStarting(routine.user_workout_routine_id);
    try {
      const answer = await startSavedRoutine(routine.user_workout_routine_id);
      const latest = await getLatestSavedRoutineSession().catch(() => null);
      const sessionId = (answer.result as { session?: { exercise_session_id?: unknown } } | undefined)?.session?.exercise_session_id;
      const logs = latest?.result && latest.result.session.exercise_session_id === sessionId ? latest.result.logs : [];
      const run = savedRoutineRun(routine.name, answer, logs);
      if (!run) throw new Error('운동 정보를 확인할 수 없어요.');
      if (run.routine.exercises.length === 0 && typeof sessionId === 'string') {
        await completeExerciseSession(sessionId);
        Alert.alert('이미 다 기록한 루틴이에요', '이 루틴 운동을 마친 것으로 저장했어요.');
        return;
      }
      beginSession(run.routine, run.started);
      router.push('/exercise/session' as Href);
    } catch (cause) {
      Alert.alert('운동을 시작하지 못했어요', getExerciseApiErrorMessage(cause));
    } finally {
      setStarting(null);
    }
  };
  const load = useCallback(() => {
    let active = true;
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
    <ScreenHeader onBack={() => router.back()} title="내 루틴" />
    {loading ? <ALoading /> : <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.filters}>
        {FILTERS.map(([key, label]) =>
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.chip, filter === key && styles.on]}>
            <Text style={[styles.chipText, filter === key && styles.onText]}>{label}</Text>
          </Pressable>)}
      </View>
      {error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.body}>{error} · 다시 시도</Text></Pressable> :
        shown.length === 0 ? <Text style={[styles.note, styles.none]}>저장한 운동이 없어요. 운동 기록에서 추천 운동을 저장하거나 루틴을 만들어 보세요.</Text> :
          <View style={[styles.card, styles.list]}>{shown.map((routine, index) => {
            const open = expanded === routine.user_workout_routine_id;
            const Fold = open ? MinusIcon : PlusIcon;
            return <View key={routine.user_workout_routine_id} style={index > 0 && styles.rowLine}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : routine.user_workout_routine_id)} style={styles.row}>
                <View style={styles.grow}>
                  <Text style={styles.body}>{routine.name}</Text>
                  <Text style={styles.note}>{routine.source_type === 'custom' ? '내 루틴' : '추천 운동'} · {routine.items.length}가지 운동</Text>
                </View>
                <Fold color={colors.ink} height={20} width={20} />
              </Pressable>
              {open ? <View style={styles.items}>{routine.items.map((item) =>
                <View key={item.user_workout_routine_item_id} style={styles.item}>
                  <Text style={styles.num}>{item.sequence_order}</Text>
                  <Text style={[styles.body, styles.grow]}>{item.exercise_name}</Text>
                  <Text style={styles.note}>{[item.sets && `${item.sets}세트`, item.repetitions && `${item.repetitions}회`, item.target_duration_seconds && `${Math.round(item.target_duration_seconds / 60)}분`].filter(Boolean).join(' · ') || '운동 정보 없음'}</Text>
                </View>)}
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: starting !== null }} disabled={starting !== null} onPress={() => void start(routine)} style={({ pressed }) => [styles.go, pressed && styles.goPressed]}>
                  <Text style={styles.goText}>{starting === routine.user_workout_routine_id ? '준비 중…' : '이 루틴으로 운동하기'}</Text>
                </Pressable>
              </View> : null}
            </View>;
          })}</View>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/routine-builder')} style={({ pressed }) => [styles.go, pressed && styles.goPressed]}><Text style={styles.goText}>새 루틴 만들기</Text></Pressable>
    </ScrollView>}
  </View>;
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    grow: { flex: 1, minWidth: 0 },
    note: a.note,
    body: { ...a.p15, color: colors.ink },
    none: { paddingVertical: 24, textAlign: 'center' },
    filters: { flexDirection: 'row', gap: 6 },
    chip: { ...a.chip, flex: 1 },
    chipText: a.segText,
    on: a.on,
    onText: a.onText,
    card: { ...a.card, padding: 14 },
    list: { paddingVertical: 2 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 60, paddingVertical: 8 },
    rowLine: { borderTopColor: colors.track, borderTopWidth: 2 },
    items: { gap: 10, paddingBottom: 12 },
    item: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    num: { ...a.p12, color: colors.textSecondary, width: 16 },
    go: { ...a.go, height: 52, marginTop: 4 },
    goPressed: a.goPressed,
    goText: a.goText,
  } as const;
}
