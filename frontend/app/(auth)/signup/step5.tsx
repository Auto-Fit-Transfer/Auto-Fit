import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Keyboard, Pressable, View } from 'react-native';
import { saveExerciseGoal, type ExerciseGoalInput } from '@/src/api/exercise';
import {
  completeOnboarding,
  getSignupApiErrorMessage,
  saveExercisePreferences,
  saveProfile,
  saveTargetWeight,
  type ExerciseGoalType,
} from '@/src/api/onboarding';
import { AuthTextField } from '@/src/components/auth/AuthRedesign';
import { SignUpScreenLayout } from '@/src/components/auth';
import { useSignup, type SignupExerciseGoal } from '@/src/features/signup/SignupContext';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

const goalType: Record<SignupExerciseGoal, ExerciseGoalType> = {
  'fat-loss': 'weight_loss',
  'muscle-gain': 'muscle_gain',
  stamina: 'endurance',
  conditioning: 'rehabilitation',
  custom: 'other',
};
const activeGoalType: Partial<Record<SignupExerciseGoal, ExerciseGoalInput['goal_type']>> = {
  'fat-loss': 'weight_loss',
  'muscle-gain': 'muscle_gain',
  stamina: 'endurance',
  conditioning: 'rehabilitation',
};

const goalNames: Partial<Record<SignupExerciseGoal, string>> = {
  'fat-loss': '체지방 감량',
  'muscle-gain': '근육량 증가',
  stamina: '체력 향상',
  conditioning: '컨디셔닝 · 기능 회복',
};
const periodOptions = [
  { label: '1개월', weeks: 4 },
  { label: '3개월', weeks: 13 },
  { label: '6개월', weeks: 26 },
] as const;
const frequencyOptions = [
  { label: '1~2번', count: 2 },
  { label: '3번', count: 3 },
  { label: '4번', count: 4 },
  { label: '5번 이상', count: 5 },
] as const;

export default function SignUpStep5Screen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLogin = flow === 'post-login';
  const { draft, resetDraft } = useSignup();
  const inFlight = useRef(false);
  const [targetWeight, setTargetWeight] = useState('');
  const [frequency, setFrequency] = useState(3);
  const [minutes, setMinutes] = useState('120');
  const [weeks, setWeeks] = useState<number | null>(13);
  const [saving, setSaving] = useState(false);
  const showWeight = draft.exerciseGoal === 'fat-loss' || draft.exerciseGoal === 'muscle-gain';

  const finish = async (skipGoal = false) => {
    if (inFlight.current) return;
    const f = frequency,
      m = Number(minutes),
      w = weeks ?? 8;
    const weight = !skipGoal && targetWeight.trim() ? Number(targetWeight) : null;
    if (
      !skipGoal &&
      (!Number.isInteger(f) ||
      f < 1 ||
      f > 7 ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > 10080 ||
      !Number.isInteger(w) ||
      w < 1 ||
      w > 260)
    ) {
      Alert.alert(
        '목표를 확인해 주세요',
        '운동 횟수는 주 1~7회, 시간은 주 1~10,080분, 기간은 1~260주로 입력해 주세요.',
      );
      return;
    }
    if (
      showWeight &&
      weight !== null &&
      (!Number.isFinite(weight) || weight < 20 || weight > 500)
    ) {
      Alert.alert('목표 체중을 확인해 주세요', '목표 체중은 20~500kg 사이로 입력해 주세요.');
      return;
    }
    if (!isPostLogin && (!draft.name || !draft.birthDate || !draft.gender)) {
      Alert.alert('회원가입 정보가 없습니다', '기본 정보부터 다시 입력해 주세요.');
      router.replace('/signup/step1');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      if (!isPostLogin)
        await saveProfile({ name: draft.name, birthDate: draft.birthDate!, gender: draft.gender! });
      await saveExercisePreferences(
        goalType[draft.exerciseGoal],
        draft.exerciseExperience,
        draft.exerciseGoal === 'custom' ? draft.customGoal.trim() : null,
      );
      if (showWeight && weight !== null) await saveTargetWeight(weight);
      const supportedGoal = activeGoalType[draft.exerciseGoal];
      if (supportedGoal && !skipGoal)
        await saveExerciseGoal({
          goal_type: supportedGoal,
          weekly_frequency: f,
          weekly_duration_minutes: m,
          goal_period_weeks: w,
        });
      await completeOnboarding();
      resetDraft();
      router.replace({ pathname: '/upload', params: { source: 'onboarding' } });
    } catch (error) {
      Alert.alert('목표를 저장하지 못했습니다', getSignupApiErrorMessage(error));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <SignUpScreenLayout
      ctaLabel="가입 완료"
      ctaLoading={saving}
      currentStep={isPostLogin ? 4 : 5}
      totalSteps={isPostLogin ? 4 : 5}
      footerExtra={
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void finish(true)} style={styles.later}>
          <Text style={styles.laterText}>나중에 정할래요</Text>
        </Pressable>
      }
      heading={goalNames[draft.exerciseGoal] ? `${goalNames[draft.exerciseGoal]}, 조금만 더 알려 주세요` : undefined}
      onBack={() => router.back()}
      onContinue={() => void finish()}
    >
      <View style={styles.form}>
        {showWeight ? (
          <AuthTextField
            accessibilityLabel="목표 몸무게"
            label="목표 몸무게"
            keyboardType="decimal-pad"
            onChangeText={setTargetWeight}
            placeholder="52.0"
            rightElement={<Text style={styles.unit}>kg</Text>}
            value={targetWeight}
          />
        ) : null}
        <View>
          <Text style={styles.sectionTitle}>언제까지 이룰까요?</Text>
          <View style={styles.chips}>
            {periodOptions.map((option) => (
              <Chip key={option.label} label={option.label} onPress={() => setWeeks(option.weeks)} selected={weeks === option.weeks} />
            ))}
            <Chip label="정하지 않음" onPress={() => setWeeks(null)} selected={weeks === null} />
          </View>
        </View>
        <View>
          <Text style={styles.sectionTitle}>일주일에 몇 번 운동할 수 있나요?</Text>
          <View style={styles.chips}>
            {frequencyOptions.map((option) => (
              <Chip key={option.label} label={option.label} onPress={() => setFrequency(option.count)} selected={frequency === option.count} />
            ))}
          </View>
        </View>
        <AuthTextField
          accessibilityLabel="일주일 운동 시간"
          label="일주일 운동 시간 (분)"
          keyboardType="number-pad"
          onChangeText={setMinutes}
          placeholder="120"
          value={minutes}
        />
      </View>
    </SignUpScreenLayout>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    form: { gap: 28 },
    sectionTitle: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 10,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    chipTextSelected: { color: '#FFFFFF' },
    unit: { color: colors.textSecondary, fontSize: 16 },
    later: { alignItems: 'center', height: 44, justifyContent: 'center', marginTop: 8 },
    laterText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  } as const;
}
