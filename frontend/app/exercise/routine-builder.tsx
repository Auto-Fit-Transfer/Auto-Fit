import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretDownIcon from '@/assets/icons/ui/caret-down.svg';
import { getApiErrorMessage } from '@/src/api/client';
import { createCustomWorkout, type CustomWorkoutItemInput } from '@/src/api/exercise';
import { aForm } from '@/src/components/a/form';
import { Text } from '@/src/components/common';
import { AppTextField } from '@/src/components/common/AppTextField';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Making a routine of my own: a name, then the moves in order. What it saves is unchanged.
type DraftItem = { id: number; name: string; sets: string; repetitions: string };
let nextId = 2;

export default function RoutineBuilder() {
  const { colors } = useAppTheme();
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
      setError('루틴 이름과 각 운동의 이름 · 세트 · 횟수를 확인해 주세요.');
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
  const arrow = (index: number, direction: -1 | 1) => {
    const off = direction < 0 ? index === 0 : index === items.length - 1;
    return <Pressable hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }} accessibilityRole="button" accessibilityLabel={`${index + 1}번째 운동 ${direction < 0 ? '위로' : '아래로'} 이동`} accessibilityState={{ disabled: off }} disabled={off} onPress={() => move(index, direction)} style={[styles.mini, off && styles.miniOff]}>
      <View style={direction < 0 ? styles.flip : undefined}><CaretDownIcon color={colors.ink} height={16} width={16} /></View>
    </Pressable>;
  };

  return <View style={styles.root}>
    <ScreenHeader onBack={() => router.back()} title="루틴 만들기" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
      <AppTextField accessibilityLabel="루틴 이름" label="루틴 이름" maxLength={120} onChangeText={setName} placeholder="예: 상체 집중 운동" value={name} />
      <View style={styles.head}><Text style={styles.q}>운동 순서</Text><Text style={styles.note}>{items.length}가지 운동</Text></View>
      {items.map((item, index) => <View key={item.id} style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.q}>{index + 1}. 운동</Text>
          <View style={styles.actions}>
            {arrow(index, -1)}
            {arrow(index, 1)}
            {items.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번째 운동 삭제`} hitSlop={8} onPress={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Text style={styles.link}>삭제</Text></Pressable> : null}
          </View>
        </View>
        <AppTextField accessibilityLabel={`${index + 1}번째 운동 이름`} maxLength={160} onChangeText={(text) => change(item.id, { name: text })} placeholder="운동 이름" value={item.name} />
        <View style={styles.pair}>
          <AppTextField accessibilityLabel={`${index + 1}번째 운동 세트`} containerStyle={styles.grow} keyboardType="number-pad" label="세트" onChangeText={(text) => change(item.id, { sets: text })} value={item.sets} />
          <AppTextField accessibilityLabel={`${index + 1}번째 운동 횟수`} containerStyle={styles.grow} keyboardType="number-pad" label="횟수" onChangeText={(text) => change(item.id, { repetitions: text })} value={item.repetitions} />
        </View>
      </View>)}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: items.length >= 30 }} disabled={items.length >= 30} onPress={() => setItems((current) => [...current, { id: nextId++, name: '', sets: '3', repetitions: '10' }])} style={({ pressed }) => [styles.go, styles.ghost, pressed && styles.goPressed]}><Text style={styles.ghostText}>+ 운동 추가</Text></Pressable>
      {error ? <Text style={styles.note}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.go, saving && styles.goOff, pressed && styles.goPressed]}><Text style={[styles.goText, saving && styles.offText]}>{saving ? '저장 중…' : '루틴 저장하기'}</Text></Pressable>
    </ScrollView>
  </View>;
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    grow: { flex: 1 },
    q: { ...a.p15, color: colors.ink },
    note: a.note,
    link: a.link,
    head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    card: { ...a.card, gap: 12, padding: 14 },
    actions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    mini: { ...a.mini, paddingHorizontal: 0, width: 32 },
    miniOff: { opacity: 0.35 },
    flip: { transform: [{ rotate: '180deg' }] },
    pair: { flexDirection: 'row', gap: 10 },
    go: { ...a.go, height: 52 },
    ghost: a.goGhost,
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    ghostText: { ...a.goText, color: colors.ink, fontSize: 18 },
    offText: { color: colors.textDisabled },
  } as const;
}
