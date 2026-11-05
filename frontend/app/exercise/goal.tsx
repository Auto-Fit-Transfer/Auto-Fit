import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getActiveExerciseGoal, saveExerciseGoal, type ExerciseGoalInput } from '@/src/api/exercise';
import { getApiErrorMessage } from '@/src/api/client';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

const goals: { key: ExerciseGoalInput['goal_type']; label: string }[] = [
  { key: 'muscle_gain', label: '근육량 늘리기' },
  { key: 'weight_loss', label: '체중 감량하기' },
  { key: 'endurance', label: '체력 기르기' },
  { key: 'maintenance', label: '꾸준히 운동하기' },
  { key: 'rehabilitation', label: '무리 없이 회복하기' },
];
const weeksOptions = [2, 4, 8, 12];
const formatDate = (date: Date) => `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;

export default function ExerciseGoal() {
  const { colors } = useAppTheme();
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

  return <View style={styles.root}>
    <ScreenHeader onBack={() => router.back()} title="운동 목표" right={<Pressable hitSlop={16} accessibilityRole="button" onPress={() => router.push('/exercise/goal-progress')}><Text style={styles.link}>진행 보기</Text></Pressable>} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 40 }]}>
      {loading ? <ActivityIndicator color={colors.primaryText} /> : null}
      {!loading && !loaded ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={styles.card}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> : null}
      <View style={styles.card}>
        <Text style={styles.smallLabel}>목표 기간</Text>
        <Text style={styles.cardTitle}>{formatDate(startDate)} – {formatDate(endDate)}</Text>
        <View style={styles.weekOptions}>{weeksOptions.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: weeks === value }} onPress={() => { setWeeks(value); setSaved(false); }} style={[styles.weekChip, weeks === value && styles.selected]}>
          <Text style={[styles.chipText, weeks === value && styles.selectedText]}>{value}주</Text>
        </Pressable>)}</View>
        {!weeksOptions.includes(weeks) ? <Text style={styles.caption}>현재 저장된 목표 기간: {weeks}주</Text> : null}
      </View>
      <Text style={styles.sectionTitle}>무엇을 이루고 싶나요?</Text>
      <View style={styles.goalGrid}>{goals.map((goal) =>
        <Pressable key={goal.key} accessibilityRole="button" accessibilityState={{ selected: goalType === goal.key }} onPress={() => { setGoalType(goal.key); setSaved(false); }} style={[styles.goalChip, goalType === goal.key && styles.selected]}>
          <Text style={[styles.chipText, goalType === goal.key && styles.selectedText]}>{goal.label}</Text>
        </Pressable>)}</View>
      <View style={styles.card}>
        <Text style={styles.smallLabel}>일주일 운동 시간</Text>
        <View style={styles.minuteRow}><TextInput accessibilityLabel="일주일 운동 시간(분)" keyboardType="number-pad" value={weeklyMinutes} onChangeText={(value) => { setWeeklyMinutes(value); setSaved(false); }} style={styles.minuteInput} /><Text style={styles.cardTitle}>분</Text></View>
        <Text style={styles.caption}>실제 운동 기록과 비교해 진행 상황에 표시해요.</Text>
      </View>
      <Text style={styles.sectionTitle}>일주일에 몇 번 할까요?</Text>
      <View style={styles.frequency}>{Array.from({ length: 7 }, (_, index) => index + 1).map((value) =>
        <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: frequency === value }} onPress={() => { setFrequency(value); setSaved(false); }} style={[styles.frequencyChip, frequency === value && styles.selected]}>
          <Text style={[styles.chipText, frequency === value && styles.selectedText]}>{value}</Text>
        </Pressable>)}</View>
      <Text style={styles.caption}>헬스·홈트·러닝 완료 기록을 합쳐 확인해요.</Text>
      {error && loaded ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.success}>운동 목표를 저장했어요.</Text> : null}
      <Pressable accessibilityRole="button" disabled={!loaded || saving} onPress={() => void save()} style={[styles.button, (!loaded || saving) && styles.buttonDisabled]}>
        <Text style={[styles.buttonText, (!loaded || saving) && styles.disabledText]}>{saving ? '저장 중…' : '목표 저장하기'}</Text>
      </Pressable>
    </ScrollView>
  </View>;
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, gap: 17 },
    link: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    sectionTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
    smallLabel: { color: colors.textSecondary, fontSize: 14 },
    cardTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 18 },
    weekOptions: { flexDirection: 'row', gap: 8 },
    weekChip: { backgroundColor: colors.surface, flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
    goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    goalChip: { backgroundColor: colors.surface, width: '48%', borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
    selected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textPrimary, fontSize: 14 },
    selectedText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold },
    minuteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    minuteInput: { flex: 1, height: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, color: colors.textPrimary, fontSize: 16 },
    frequency: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
    frequencyChip: { backgroundColor: colors.surface, flex: 1, aspectRatio: 1, borderRadius: 24, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    button: { height: 56, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
    buttonDisabled: { backgroundColor: colors.surfaceMuted },
    disabledText: { color: colors.textDisabled },
    buttonText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    error: { color: colors.danger, fontSize: 14 },
    success: { color: colors.success, fontSize: 14 },
  } as const;
}
