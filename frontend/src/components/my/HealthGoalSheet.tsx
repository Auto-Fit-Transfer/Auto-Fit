import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  getActiveHealthGoal,
  saveActiveHealthGoal,
  type HealthGoal,
  type HealthGoalType,
} from '@/src/api/userSettings';
import { getApiErrorMessage } from '@/src/api/client';
import { AppBottomSheet, Text, TextInput } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';

export const goals: { key: HealthGoalType; label: string }[] = [
  { key: 'fat_loss', label: '체지방 감량' },
  { key: 'muscle_gain', label: '근육량 증가' },
  { key: 'fitness', label: '체력 향상' },
  { key: 'maintenance', label: '건강 유지' },
  { key: 'other', label: '직접 정하기' },
];

type Props = { visible: boolean; onClose: () => void };

export function HealthGoalSheet({ visible, onClose }: Props) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [current, setCurrent] = useState<HealthGoal | null>(null);
  const [goalType, setGoalType] = useState<HealthGoalType | null>(null);
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    void getActiveHealthGoal()
      .then(({ goal }) => {
        if (!live) return;
        setCurrent(goal);
        setGoalType(goal?.goal_type ?? null);
        setDetail(goal?.goal_text ?? '');
        setLoaded(true);
      })
      .catch((cause) => { if (live) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [visible, attempt]);

  const save = async () => {
    if (!loaded || saving || !goalType) return;
    const goalText = detail.trim() || null;
    if (goalType === 'other' && !goalText) {
      setError('직접 정한 목표를 한 줄로 적어 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { goal } = await saveActiveHealthGoal({ goal_type: goalType, goal_text: goalText });
      setCurrent(goal);
      setGoalType(goal.goal_type);
      setDetail(goal.goal_text ?? '');
      setSaved(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

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
          accessibilityState={{ disabled: !loaded || !goalType || saving }}
          disabled={!loaded || !goalType || saving}
          onPress={() => void save()}
          style={[styles.save, (!loaded || !goalType || saving) && styles.disabled]}
        >
          <Text style={[styles.saveText, (!loaded || !goalType || saving) && styles.disabledText]}>{saving ? '저장 중…' : '저장하기'}</Text>
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
          <Text style={styles.sectionTitle}>목표 종류</Text>
          <View style={styles.choices}>
            {goals.map((goal) => (
              <Pressable
                key={goal.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: goalType === goal.key }}
                onPress={() => { setGoalType(goal.key); setSaved(false); setError(''); }}
                style={[styles.choice, goalType === goal.key && styles.selected]}
              >
                <Text style={[styles.choiceText, goalType === goal.key && styles.selectedText]}>{goal.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sectionTitle}>내 목표를 한 줄로 <Text style={styles.optional}>{goalType === 'other' ? '(필수)' : '(선택)'}</Text></Text>
          <TextInput
            accessibilityLabel="건강 목표 설명"
            maxLength={200}
            placeholder="예: 결혼식 준비를 위한 체지방 감량"
            placeholderTextColor={colors.textDisabled}
            value={detail}
            onChangeText={(value) => { setDetail(value); setSaved(false); setError(''); }}
            style={styles.input}
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {saved ? <Text accessibilityRole="alert" style={styles.success}>건강 목표를 저장했어요.</Text> : null}
        </>
      ) : error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </AppBottomSheet>
  );
}

function createStyles({ colors }: AppTheme) {
  // Renewal A: the goal now in a violet box, the five kinds as outlined chips (three, then two).
  const a = aForm(colors);
  return {
    content: { gap: 14 },
    current: { backgroundColor: colors.primaryLight, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, gap: 2, padding: 12 },
    currentLabel: a.note,
    currentText: { ...a.p15, color: colors.ink },
    sectionTitle: { ...a.q, marginBottom: 0 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { ...a.chip, flexBasis: '30%', flexGrow: 1, height: 40 },
    selected: a.on,
    choiceText: a.chipText,
    selectedText: a.onText,
    optional: { color: colors.textSecondary },
    input: { backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, color: colors.ink, fontFamily: fontFamilies.galmuri14, fontSize: 15, height: 48, paddingHorizontal: 12 },
    note: a.note,
    retry: a.link,
    error: { ...a.p12, color: colors.danger },
    success: { ...a.p12, color: colors.success },
    save: a.go,
    disabled: { ...a.goOff, boxShadow: '0 0 0 rgba(32, 35, 63, 0.3)' },
    disabledText: { color: colors.textDisabled },
    saveText: a.goText,
  } as const;
}
