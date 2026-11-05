import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { createCustomWorkout, type CustomWorkoutItemInput } from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

type DraftItem = { id: number; name: string; sets: string; repetitions: string };
let nextId = 2;

export default function RoutineBuilder() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ id: 1, name: '', sets: '3', repetitions: '10' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const change = (id: number, patch: Partial<DraftItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => setItems((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const save = async () => {
    const title = name.trim();
    const valid = items.every((item) => item.name.trim() && Number.isInteger(Number(item.sets)) &&
      Number(item.sets) >= 1 && Number(item.sets) <= 100 &&
      Number.isInteger(Number(item.repetitions)) && Number(item.repetitions) >= 1 && Number(item.repetitions) <= 10000);
    if (!title || !valid || items.length === 0 || title.length > 120) {
      setError('루틴 이름과 각 운동의 이름·세트·횟수를 확인해 주세요.');
      return;
    }
    const payload: CustomWorkoutItemInput[] = items.map((item) => ({
      exercise_name: item.name.trim(),
      sets: Number(item.sets),
      repetitions: Number(item.repetitions),
      target_duration_seconds: null,
      rest_seconds: null,
      instruction: '',
    }));
    setSaving(true);
    setError('');
    try {
      await createCustomWorkout(title, payload);
      router.replace('/exercise/saved-routines');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.root}>
    <ScreenHeader onBack={() => router.back()} title="루틴 만들기" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 40 }]}>
      <Text style={styles.label}>루틴 이름</Text>
      <TextInput accessibilityLabel="루틴 이름" value={name} onChangeText={setName} maxLength={120} placeholder="예: 상체 집중 운동" style={styles.input} />
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>운동 순서</Text><Text style={styles.caption}>{items.length}개 운동</Text></View>
      {items.map((item, index) => <View key={item.id} style={styles.card}>
        <View style={styles.sectionRow}><Text style={styles.itemTitle}>{index + 1}. 운동</Text>
          <View style={styles.itemActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번째 운동 위로 이동`} disabled={index === 0} onPress={() => move(index, -1)} style={styles.move}><Text style={[styles.moveText, index === 0 && styles.moveDisabled]}>↑</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번째 운동 아래로 이동`} disabled={index === items.length - 1} onPress={() => move(index, 1)} style={styles.move}><Text style={[styles.moveText, index === items.length - 1 && styles.moveDisabled]}>↓</Text></Pressable>
            {items.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번째 운동 삭제`} onPress={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Text style={styles.remove}>삭제</Text></Pressable> : null}
          </View>
        </View>
        <TextInput accessibilityLabel={`${index + 1}번째 운동 이름`} value={item.name} onChangeText={(text) => change(item.id, { name: text })} maxLength={160} placeholder="운동 이름" style={styles.input} />
        <View style={styles.inputRow}>
          <View style={{ flex: 1 }}><Text style={styles.caption}>세트</Text><TextInput accessibilityLabel={`${index + 1}번째 운동 세트`} value={item.sets} onChangeText={(text) => change(item.id, { sets: text })} keyboardType="number-pad" style={styles.input} /></View>
          <View style={{ flex: 1 }}><Text style={styles.caption}>횟수</Text><TextInput accessibilityLabel={`${index + 1}번째 운동 횟수`} value={item.repetitions} onChangeText={(text) => change(item.id, { repetitions: text })} keyboardType="number-pad" style={styles.input} /></View>
        </View>
      </View>)}
      <Pressable accessibilityRole="button" disabled={items.length >= 30} onPress={() => setItems((current) => [...current, { id: nextId++, name: '', sets: '3', repetitions: '10' }])} style={styles.add}><Text style={styles.addText}>＋ 운동 추가</Text></Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.button, saving && styles.buttonDisabled]}><Text style={[styles.buttonText, saving && styles.disabledText]}>{saving ? '저장 중…' : '루틴 저장하기'}</Text></Pressable>
    </ScrollView>
  </View>;
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, gap: 15 },
    label: { fontSize: 14, color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium },
    input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, minHeight: 52, color: colors.textPrimary, fontSize: 16 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: fontFamilies.pretendardBold },
    caption: { color: colors.textSecondary, fontSize: 14, marginBottom: 5 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, gap: 12 },
    itemTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    move: { backgroundColor: colors.surface, width: 29, height: 29, borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    moveText: { color: colors.textPrimary, fontSize: 18, lineHeight: 22 },
    moveDisabled: { color: '#C8C9CE' },
    remove: { color: colors.danger, fontSize: 14 },
    inputRow: { flexDirection: 'row', gap: 10 },
    add: { backgroundColor: colors.surface, height: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    addText: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    button: { backgroundColor: colors.primary, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
    buttonDisabled: { backgroundColor: colors.surfaceMuted },
    disabledText: { color: colors.textDisabled },
    buttonText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    error: { color: colors.danger, fontSize: 14 },
  } as const;
}
