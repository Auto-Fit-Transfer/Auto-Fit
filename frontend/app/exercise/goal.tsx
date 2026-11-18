import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiErrorMessage } from '@/src/api/client';
import { getActiveExerciseGoal, saveExerciseGoal, type ExerciseGoalInput } from '@/src/api/exercise';
import { aForm } from '@/src/components/a/form';
import { ALoading } from '@/src/components/a/ALoading';
import { Text } from '@/src/components/common';
import { AppTextField } from '@/src/components/common/AppTextField';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { koreanDate } from '@/src/lib/koreanDate';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

// My workout goal: what for, how long, how many minutes and times a week. What it saves is unchanged.
const goals: { key: ExerciseGoalInput['goal_type']; label: string }[] = [
  { key: 'muscle_gain', label: '근육량 늘리기' },
  { key: 'weight_loss', label: '체중 감량하기' },
  { key: 'endurance', label: '체력 기르기' },
  { key: 'maintenance', label: '꾸준히 운동하기' },
  { key: 'rehabilitation', label: '무리 없이 회복하기' },
];
const weeksOptions = [2, 4, 8, 12];

export default function ExerciseGoal() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [goalType, setGoalType] = useState<ExerciseGoalInput['goal_type']>('endurance');
  const [frequency, setFrequency] = useState(3);
  const [weeklyMinutes, setWeeklyMinutes] = useState('90');
  const [weeks, setWeeks] = useState(4);
  const [startsOn, setStartsOn] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const startDate = startsOn ? new Date(`${startsOn}T12:00:00`) : new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + weeks * 7 - 1);

  useEffect(() => {
    let active = true;
    void getActiveExerciseGoal().then((response) => {
      if (!active) return;
      const goal = response.goal as Partial<ExerciseGoalInput> | null;
      if (goal) {
        if (goals.some((choice) => choice.key === goal.goal_type)) setGoalType(goal.goal_type!);
        if (goal.weekly_frequency) setFrequency(goal.weekly_frequency);
        if (goal.weekly_duration_minutes) setWeeklyMinutes(String(goal.weekly_duration_minutes));
        if (goal.goal_period_weeks) setWeeks(goal.goal_period_weeks);
        setStartsOn(goal.starts_on);
      }
      setLoaded(true);
      setError('');
    }).catch((cause) => { if (active) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const save = async () => {
    const minutes = Number(weeklyMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      setError('일주일 운동 시간은 1~10,080분으로 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveExerciseGoal({
        goal_type: goalType, weekly_frequency: frequency,
        weekly_duration_minutes: minutes, goal_period_weeks: weeks,
        ...(startsOn ? { starts_on: startsOn } : {}),
      });
      setSaved(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const chip = (label: string, selected: boolean, onPress: () => void, style?: object) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={label} onPress={() => { onPress(); setSaved(false); }} style={[styles.chip, style, selected && styles.on]}>
      <Text style={[styles.chipText, selected && styles.onText]}>{label}</Text>
    </Pressable>
  );

  return <View style={styles.root}>
    <ScreenHeader onBack={() => router.back()} title="운동 목표" />
    {loading ? <ALoading /> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
      {!loaded ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.body}>{error} · 다시 시도</Text></Pressable> : null}
      <View style={styles.ask}>
        <Text style={styles.q}>무엇을 이루고 싶나요?</Text>
        <View style={styles.grid}>{goals.map((goal) => chip(goal.label, goalType === goal.key, () => setGoalType(goal.key), styles.half))}</View>
      </View>
      <View style={styles.ask}>
        <Text style={styles.q}>목표 기간 <Text style={styles.note}> {koreanDate(startDate)} – {koreanDate(endDate)}</Text></Text>
        <View style={styles.row}>{weeksOptions.map((value) => chip(`${value}주`, weeks === value, () => setWeeks(value), styles.flex))}</View>
        {!weeksOptions.includes(weeks) ? <Text style={styles.note}>지금 저장된 목표 기간: {weeks}주</Text> : null}
      </View>
      <AppTextField
        accessibilityLabel="일주일 운동 시간(분)"
        helperText="실제 운동 기록과 견줘 운동 기록 화면에 보여요."
        keyboardType="number-pad"
        label="일주일 운동 시간 (분)"
        onChangeText={(value) => { setWeeklyMinutes(value); setSaved(false); }}
        value={weeklyMinutes}
      />
      <View style={styles.ask}>
        <Text style={styles.q}>일주일에 몇 번 할까요?</Text>
        <View style={styles.row}>{Array.from({ length: 7 }, (_, index) => index + 1).map((value) => chip(String(value), frequency === value, () => setFrequency(value), styles.flex))}</View>
        <Text style={styles.note}>헬스 · 홈트 · 러닝을 마친 기록을 합쳐서 세요.</Text>
      </View>
      {error && loaded ? <Text style={styles.note}>{error}</Text> : null}
      {saved ? <Text style={styles.body}>운동 목표를 저장했어요.</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !loaded || saving }} disabled={!loaded || saving} onPress={() => void save()} style={({ pressed }) => [styles.go, (!loaded || saving) && styles.goOff, pressed && styles.goPressed]}>
        <Text style={[styles.goText, (!loaded || saving) && styles.offText]}>{saving ? '저장 중…' : '목표 저장하기'}</Text>
      </Pressable>
    </ScrollView>}
  </View>;
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 18, paddingHorizontal: 16, paddingTop: 12 },
    ask: { gap: 10 },
    q: { ...a.p15, color: colors.ink },
    note: a.note,
    body: { ...a.p15, color: colors.ink },
    card: { ...a.card, padding: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    row: { flexDirection: 'row', gap: 6 },
    half: { width: '48.5%' },
    flex: { flex: 1 },
    chip: a.chip,
    chipText: a.segText,
    on: a.on,
    onText: a.onText,
    go: { ...a.go, height: 52 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: { ...a.goText, fontFamily: fontFamilies.galmuri11Bold },
    offText: { color: colors.textDisabled },
  } as const;
}
