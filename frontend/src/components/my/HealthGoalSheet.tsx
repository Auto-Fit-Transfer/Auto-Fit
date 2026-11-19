import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { getApiErrorMessage } from '@/src/api/client';
import { getActiveExerciseGoal, saveExerciseGoal, type ExerciseGoalInput } from '@/src/api/exercise';
import { getProfile, updateProfile } from '@/src/api/home';
import {
  getActiveHealthGoal,
  saveActiveHealthGoal,
  type HealthGoal,
  type HealthGoalType,
} from '@/src/api/userSettings';
import { aForm } from '@/src/components/a/form';
import { AppBottomSheet, Text } from '@/src/components/common';
import { AppTextField } from '@/src/components/common/AppTextField';
import { useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal A's one health-goal box (a-me.html): what for, in one line, the weight to reach, how long a day,
// by when and how often a week. The server keeps these in three places, so one save writes up to three:
// the health goal, the profile's target weight and the exercise goal the workout record measures against.
export const goals: { key: HealthGoalType; label: string }[] = [
  { key: 'fat_loss', label: '체지방 감량' },
  { key: 'muscle_gain', label: '근육량 증가' },
  { key: 'fitness', label: '체력 향상' },
  { key: 'maintenance', label: '건강 유지' },
  { key: 'other', label: '직접 정하기' },
];
const EXERCISE_KIND: Record<HealthGoalType, ExerciseGoalInput['goal_type'] | null> = {
  fat_loss: 'weight_loss', muscle_gain: 'muscle_gain', fitness: 'endurance', maintenance: 'maintenance', other: null,
};
const PERIODS = [['1개월', 4], ['3개월', 13], ['6개월', 26]] as const;
const TIMES = [1, 2, 3, 4, 5, 6, 7];
type ExerciseGoal = Partial<ExerciseGoalInput> | null;
const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

type Props = { visible: boolean; onClose: () => void };

export function HealthGoalSheet({ visible, onClose }: Props) {
  const styles = useThemedStyles(createStyles);
  const [current, setCurrent] = useState<HealthGoal | null>(null);
  const [goalType, setGoalType] = useState<HealthGoalType | null>(null);
  const [detail, setDetail] = useState('');
  const [weight, setWeight] = useState('');
  const [savedWeight, setSavedWeight] = useState('');
  const [minutes, setMinutes] = useState('');
  const [weeks, setWeeks] = useState<number | null>(null);
  const [times, setTimes] = useState<number | null>(null);
  const [exercise, setExercise] = useState<ExerciseGoal>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    void Promise.all([getActiveHealthGoal(), getProfile(), getActiveExerciseGoal()])
      .then(([health, profile, exerciseGoal]) => {
        if (!live) return;
        const goal = health.goal;
        const kept = ((exerciseGoal as { goal?: ExerciseGoal }).goal ?? null) as ExerciseGoal;
        const target = Number(profile.profile?.target_weight);
        setCurrent(goal);
        setGoalType(goal?.goal_type ?? null);
        setDetail(goal?.goal_text ?? '');
        setWeight(Number.isFinite(target) && target > 0 ? String(target) : '');
        setSavedWeight(Number.isFinite(target) && target > 0 ? String(target) : '');
        setExercise(kept);
        setTimes(kept?.weekly_frequency ?? null);
        setWeeks(kept?.goal_period_weeks ?? null);
        // the server keeps a week's minutes; the box asks for a day's (the record draws a day's goal the same way)
        setMinutes(kept?.weekly_duration_minutes && kept.weekly_frequency ? String(Math.round(kept.weekly_duration_minutes / kept.weekly_frequency)) : '');
        setLoaded(true);
      })
      .catch((cause) => { if (live) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [visible, attempt]);

  const touch = () => { setSaved(false); setError(''); };
  const save = async () => {
    if (!loaded || saving || !goalType) return;
    const goalText = detail.trim() || null;
    if (goalType === 'other' && !goalText) return setError('직접 정한 목표를 한 줄로 적어 주세요.');
    const kg = weight.trim() ? Number(weight.trim()) : null;
    if (weight.trim() && !(kg !== null && Number.isFinite(kg) && kg >= 20 && kg <= 500)) return setError('목표 몸무게는 20~500kg으로 적어 주세요.');
    const day = minutes.trim() ? whole(minutes) : null;
    if (minutes.trim() && !(day && day >= 1 && day <= 1440)) return setError('하루 운동 시간은 1~1,440분으로 적어 주세요.');
    const exerciseAsked = Boolean(day || times || weeks);
    if (exerciseAsked && !(day && times)) return setError('운동 목표는 하루 운동 시간과 일주일 횟수를 같이 정해 주세요.');

    setSaving(true);
    setError('');
    setSaved(false);
    const failed: string[] = [];
    try {
      const { goal } = await saveActiveHealthGoal({ goal_type: goalType, goal_text: goalText });
      setCurrent(goal);
    } catch (cause) {
      failed.push(`건강 목표: ${getApiErrorMessage(cause)}`);
    }
    if (kg !== null && String(kg) !== savedWeight) {
      try {
        await updateProfile({ target_weight: kg });
        setSavedWeight(String(kg));
      } catch (cause) {
        failed.push(`목표 몸무게: ${getApiErrorMessage(cause)}`);
      }
    }
    if (exerciseAsked && day && times) {
      try {
        const next = {
          // "직접 정하기" has no kind of workout: the one already kept stays, or 꾸준히
          goal_type: EXERCISE_KIND[goalType] ?? exercise?.goal_type ?? 'maintenance',
          goal_period_weeks: weeks ?? exercise?.goal_period_weeks ?? 4,
          weekly_duration_minutes: Math.min(10080, day * times),
          weekly_frequency: times,
          ...(exercise?.starts_on ? { starts_on: exercise.starts_on } : {}),
        };
        await saveExerciseGoal(next);
        setExercise(next);
      } catch (cause) {
        failed.push(`운동 목표: ${getApiErrorMessage(cause)}`);
      }
    }
    setSaving(false);
    if (failed.length) setError(failed.join('\n'));
    else setSaved(true);
  };

  const chip = (label: string, selected: boolean, onPress: () => void, style?: object) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      key={label}
      onPress={() => { onPress(); touch(); }}
      style={[styles.choice, style, selected && styles.selected]}
    >
      <Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
  const off = !loaded || !goalType || saving;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="건강 목표"
      scrollable="when-overflow"
      keyboardShouldPersistTaps="handled"
      contentStyle={styles.content}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: off }}
          disabled={off}
          onPress={() => void save()}
          style={[styles.save, off && styles.disabled]}
        >
          <Text style={[styles.saveText, off && styles.disabledText]}>{saving ? '저장 중…' : '저장하기'}</Text>
        </Pressable>
      }
    >
      {loading ? <Text style={styles.note}>건강 목표를 불러오는 중이에요.</Text> : null}
      {!loaded && !loading ? (
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setError(''); setAttempt((value) => value + 1); }}>
          <Text style={styles.retry}>목표를 불러오지 못했어요. 다시 시도하기</Text>
        </Pressable>
      ) : null}
      {loaded ? (
        <>
          <View style={styles.current}>
            <Text style={styles.currentLabel}>지금 목표</Text>
            <Text style={styles.currentText}>
              {current?.goal_text || goals.find((goal) => goal.key === current?.goal_type)?.label || '아직 설정한 목표가 없어요'}
            </Text>
          </View>
          <View style={styles.choices}>
            {goals.map((goal) => chip(goal.label, goalType === goal.key, () => setGoalType(goal.key), styles.third))}
          </View>
          <AppTextField
            accessibilityLabel="건강 목표 설명"
            label={goalType === 'other' ? '내 목표를 한 줄로 (필수)' : '내 목표를 한 줄로 (선택)'}
            maxLength={200}
            onChangeText={(value) => { setDetail(value); touch(); }}
            placeholder="예: 결혼식 준비를 위한 체지방 감량"
            value={detail}
          />
          <View style={styles.pair}>
            <AppTextField
              accessibilityLabel="목표 몸무게(kg)"
              containerStyle={styles.grow}
              keyboardType="decimal-pad"
              label="목표 몸무게 (kg)"
              maxLength={5}
              onChangeText={(value) => { setWeight(value); touch(); }}
              placeholder="52.0"
              value={weight}
            />
            <AppTextField
              accessibilityLabel="하루 운동 시간(분)"
              containerStyle={styles.grow}
              keyboardType="number-pad"
              label="하루 운동 시간 (분)"
              maxLength={4}
              onChangeText={(value) => { setMinutes(value); touch(); }}
              placeholder="30"
              value={minutes}
            />
          </View>
          <Text style={styles.sectionTitle}>언제까지 이룰까요?</Text>
          <View style={styles.row}>
            {PERIODS.map(([label, value]) => chip(label, weeks === value, () => setWeeks(value), styles.grow))}
            {weeks !== null && !PERIODS.some(([, value]) => value === weeks) ? chip(`지금 ${weeks}주`, true, () => undefined, styles.grow) : null}
          </View>
          <Text style={styles.sectionTitle}>일주일에 몇 번 운동할 수 있나요?</Text>
          <View style={styles.row}>{TIMES.map((value) => chip(String(value), times === value, () => setTimes(value), styles.grow))}</View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {saved ? <Text accessibilityRole="alert" style={styles.success}>건강 목표를 저장했어요.</Text> : null}
        </>
      ) : error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </AppBottomSheet>
  );
}

function createStyles({ colors }: AppTheme) {
  // Renewal A: the goal now in a violet box, the choices as outlined chips, no red letters.
  const a = aForm(colors);
  return {
    content: { gap: 14 },
    current: { backgroundColor: colors.primaryLight, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, gap: 2, padding: 12 },
    currentLabel: a.note,
    currentText: { ...a.p15, color: colors.ink },
    sectionTitle: { ...a.q, marginBottom: -4 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    third: { flexBasis: '30%', flexGrow: 1 },
    row: { flexDirection: 'row', gap: 6 },
    pair: { flexDirection: 'row', gap: 10 },
    grow: { flex: 1 },
    choice: { ...a.chip, height: 40 },
    selected: a.on,
    choiceText: a.chipText,
    selectedText: a.onText,
    note: a.note,
    retry: a.link,
    error: { ...a.p12, color: colors.ink },
    success: { ...a.p12, color: colors.ink },
    save: a.go,
    disabled: { ...a.goOff, boxShadow: '0 0 0 rgba(32, 35, 63, 0.3)' },
    disabledText: { color: colors.textDisabled },
    saveText: a.goText,
  } as const;
}
