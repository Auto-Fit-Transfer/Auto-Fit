import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Keyboard, StyleSheet, Text, View } from 'react-native';
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
import { fontFamilies } from '@/src/theme';

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

export default function SignUpStep5Screen() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLogin = flow === 'post-login';
  const { draft, resetDraft } = useSignup();
  const inFlight = useRef(false);
  const [targetWeight, setTargetWeight] = useState('');
  const [frequency, setFrequency] = useState('3');
  const [minutes, setMinutes] = useState('120');
  const [weeks, setWeeks] = useState('8');
  const [saving, setSaving] = useState(false);
  const showWeight = draft.exerciseGoal === 'fat-loss' || draft.exerciseGoal === 'muscle-gain';

  const finish = async () => {
    if (inFlight.current) return;
    const f = Number(frequency),
      m = Number(minutes),
      w = Number(weeks);
    const weight = targetWeight.trim() ? Number(targetWeight) : null;
    if (
      !Number.isInteger(f) ||
      f < 1 ||
      f > 7 ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > 10080 ||
      !Number.isInteger(w) ||
      w < 1 ||
      w > 260
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
      if (supportedGoal)
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
      ctaLabel="시작하기"
      ctaLoading={saving}
      currentStep={isPostLogin ? 4 : 5}
      totalSteps={isPostLogin ? 4 : 5}
      onBack={() => router.back()}
      onContinue={() => void finish()}
    >
      <View style={styles.form}>
        {showWeight ? (
          <AuthTextField
            accessibilityLabel="목표 체중"
            label="목표 체중 (선택)"
            keyboardType="decimal-pad"
            onChangeText={setTargetWeight}
            placeholder="예: 52 kg"
            value={targetWeight}
          />
        ) : null}
        <Text style={styles.sectionTitle}>운동 계획</Text>
        <AuthTextField
          accessibilityLabel="일주일 운동 횟수"
          label="일주일 운동 횟수"
          keyboardType="number-pad"
          onChangeText={setFrequency}
          placeholder="주 1~7회"
          value={frequency}
        />
        <AuthTextField
          accessibilityLabel="일주일 운동 시간"
          label="일주일 운동 시간 (분)"
          keyboardType="number-pad"
          onChangeText={setMinutes}
          placeholder="주간 총 운동 시간"
          value={minutes}
        />
        <AuthTextField
          accessibilityLabel="목표 기간"
          label="목표 기간 (주)"
          keyboardType="number-pad"
          onChangeText={setWeeks}
          placeholder="목표 기간"
          value={weeks}
        />
        <Text style={styles.note}>운동 목표는 나중에 마이페이지에서 수정할 수 있어요.</Text>
      </View>
    </SignUpScreenLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18 },
  sectionTitle: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 17,
    marginTop: 8,
  },
  note: { color: '#87878F', fontSize: 12, lineHeight: 18 },
});
