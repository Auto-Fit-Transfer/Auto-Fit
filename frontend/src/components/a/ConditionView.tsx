import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HouseIcon from '@/assets/icons/ui/house.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { Text } from '@/src/components/common';
import { AppTextField } from '@/src/components/common/AppTextField';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import {
  exerciseEquipmentLabels,
  exerciseLocationLabels,
  type ExerciseCondition,
  type ExerciseEquipment,
  type ExerciseLocation,
} from '@/src/features/exercise/exerciseData';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';

// Renewal A's "what is today like" before a routine is made: four questions answered with chips, where it
// hurts, and the button right under them. A view that only shows what it is given;
// app/exercise/condition.tsx keeps what it asks the server.
const TIMES = [30, 45, 60, 90, 120];
const PLACES: ExerciseLocation[] = ['gym', 'home', 'outdoor', 'other'];
const TOOLS: ExerciseEquipment[] = ['bodyweight', 'band', 'dumbbell', 'machine', 'other'];
const FEELS = ['좋음', '보통', '피곤해요', '안 좋아요'];

export interface ConditionViewProps {
  value: ExerciseCondition;
  busy: boolean;
  error: string;
  onChange: (next: ExerciseCondition) => void;
  onGo: () => void;
  onBack: () => void;
  onHome: () => void;
}

export function ConditionView({ value, busy, error, onChange, onGo, onBack, onHome }: ConditionViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const chip = (label: string, selected: boolean, onPress: () => void, many = false) => (
    <Pressable
      accessibilityLabel={label.replace('+', ' 이상')}
      accessibilityRole={many ? 'checkbox' : 'radio'}
      accessibilityState={many ? { checked: selected } : { selected }}
      key={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.on]}
    >
      <Text style={[styles.chipText, selected && styles.onText]}>{label}</Text>
    </Pressable>
  );
  const ask = (title: string, chips: ReactNode, hint?: string) => (
    <View style={styles.ask}>
      <Text style={styles.q}>
        {title}
        {hint ? <Text style={styles.note}>  {hint}</Text> : null}
      </Text>
      <View style={styles.chips}>{chips}</View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScreenHeader
        onBack={onBack}
        right={
          <Pressable accessibilityLabel="홈으로 가기" accessibilityRole="button" hitSlop={12} onPress={onHome}>
            <HouseIcon color={colors.textPrimary} height={24} width={24} />
          </Pressable>
        }
        title="오늘의 운동 설정"
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {ask('운동할 수 있는 시간', TIMES.map((minutes) => chip(minutes === 120 ? '120분+' : `${minutes}분`, value.availableMinutes === minutes, () => onChange({ ...value, availableMinutes: minutes }))))}
        {ask('어디서 하나요?', PLACES.map((place) => chip(exerciseLocationLabels[place], value.location === place, () => onChange({ ...value, location: place }))))}
        {ask(
          '쓸 수 있는 기구',
          TOOLS.map((tool) => chip(
            exerciseEquipmentLabels[tool],
            value.equipment.includes(tool),
            () => onChange({ ...value, equipment: value.equipment.includes(tool) ? value.equipment.filter((item) => item !== tool) : [...value.equipment, tool] }),
            true,
          )),
          '여러 개 고를 수 있어요',
        )}
        {ask('오늘 컨디션', FEELS.map((feel) => chip(feel, value.condition === feel, () => onChange({ ...value, condition: feel }))))}
        <AppTextField
          accessibilityLabel="불편한 부위"
          helperText="적어 주시면 그 부위는 피해서 추천해요."
          label="불편한 곳 (선택)"
          maxLength={50}
          onChangeText={(text) => onChange({ ...value, discomfortArea: text })}
          placeholder="예) 오른쪽 무릎, 허리"
          value={value.discomfortArea}
        />
        <View style={styles.care}>
          <WarningIcon color={colors.textPrimary} height={18} width={18} />
          <Text style={styles.careText}>통증이 심하면 운동을 멈추고 전문가와 상담해 주세요.</Text>
        </View>
        {error ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onGo}
          style={({ pressed }) => [styles.go, busy && styles.goOff, pressed && styles.goPressed]}
        >
          <Text style={[styles.goText, busy && styles.offText]}>{busy ? '만드는 중…' : '맞춤 운동 만들기'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 18, paddingHorizontal: 16, paddingTop: 12 },
    ask: { gap: 10 },
    q: { ...a.p15, color: colors.textPrimary },
    note: a.note,
    // one row a question, every answer the same width: no answer falls alone to a second row
    chips: { flexDirection: 'row', gap: 6 },
    chip: { ...a.chip, flex: 1 },
    chipText: a.segText,
    on: a.on,
    onText: a.onText,
    care: { alignItems: 'center', backgroundColor: colors.warningLight, borderRadius: 14, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    careText: { ...a.p12, color: colors.textPrimary, flex: 1 },
    error: { ...a.p12, color: colors.danger },
    go: { ...a.go, height: 52 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    offText: { color: colors.textDisabled },
  } as const;
}
