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
} from '@/src/api/onboarding';
import { AskCard, AskChip, AskField, AskRow } from '@/src/components/b/AskCard';
import { SignUpScreenLayout } from '@/src/components/auth';
import { useSignup, type SignupExerciseGoal } from '@/src/features/signup/SignupContext';
import { goalType } from '@/src/features/signup/goalType';
import { bodyBasicsError, saveBodyBasics } from '@/src/features/a/bodyBasics';
import { aForm } from '@/src/components/a/form';
import { useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

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
  // height and weight now, for the daily calorie goal with the age and sex of step 1
  const [height, setHeight] = useState('');
  const [weightNow, setWeightNow] = useState('');
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
    const basicsError = bodyBasicsError(height, weightNow);
    // skipping the goal may leave them out, but what is written must be right
    if (basicsError && (!skipGoal || height.trim() || weightNow.trim())) {
      Alert.alert('키 · 몸무게를 확인해 주세요', basicsError);
      return;
    }
    if (!isPostLogin && (!draft.name || !draft.birthDate || !draft.gender)) {
      Alert.alert('회원가입 정보가 없습니다', '기본 정보부터 다시 입력해 주세요.');
      router.replace('/login'); // renewal B starts sign-up with the one sentence
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
      if (!basicsError) await saveBodyBasics(height, weightNow);
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
      headline={goalNames[draft.exerciseGoal]
        ? [[{ text: goalNames[draft.exerciseGoal] ?? '', mark: true }, { text: ',' }], [{ text: '조금만 더 알려 주세요' }]]
        : [[{ text: '목표를 ' }, { text: '조금만 더', mark: true }], [{ text: '알려 주세요' }]]}
      onBack={() => router.back()}
      onContinue={() => void finish()}
    >
      {/* renewal B (11/27): what the goal needs, as questions in the black card */}
      <AskCard>
        <AskRow answered={Boolean(height.trim() && weightNow.trim())} first title="키 · 지금 몸무게">
          <View style={styles.pair}>
            <View style={styles.grow}>
              <AskField accessibilityLabel="키" keyboardType="decimal-pad" maxLength={5} onChangeText={setHeight} placeholder="160" unit="cm" value={height} />
            </View>
            <View style={styles.grow}>
              <AskField accessibilityLabel="지금 몸무게" keyboardType="decimal-pad" maxLength={5} onChangeText={setWeightNow} placeholder="55.0" unit="kg" value={weightNow} />
            </View>
          </View>
        </AskRow>
        {showWeight ? (
          <AskRow answered={Boolean(targetWeight.trim())} title="목표 몸무게">
            <AskField accessibilityLabel="목표 몸무게" keyboardType="decimal-pad" onChangeText={setTargetWeight} placeholder="52.0" unit="kg" value={targetWeight} />
          </AskRow>
        ) : null}
        <AskRow answered title="언제까지 이룰까요?">
          <View style={styles.chips}>
            {periodOptions.map((option) => (
              <AskChip key={option.label} label={option.label} onPress={() => setWeeks(option.weeks)} selected={weeks === option.weeks} style={styles.grow} />
            ))}
            <AskChip label="정하지 않음" onPress={() => setWeeks(null)} selected={weeks === null} style={styles.wider} />
          </View>
        </AskRow>
        <AskRow answered title="일주일에 몇 번 운동할 수 있나요?">
          <View style={styles.chips}>
            {frequencyOptions.map((option) => (
              <AskChip key={option.label} label={option.label} onPress={() => setFrequency(option.count)} selected={frequency === option.count} style={styles.grow} />
            ))}
          </View>
        </AskRow>
        <AskRow answered={Boolean(minutes.trim())} title="일주일 운동 시간">
          <AskField accessibilityLabel="일주일 운동 시간" keyboardType="number-pad" onChangeText={setMinutes} placeholder="120" unit="분" value={minutes} />
        </AskRow>
      </AskCard>
    </SignUpScreenLayout>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    pair: { flexDirection: 'row', gap: 6 },
    grow: { flex: 1 },
    // the longest answer gets the room it needs, so no word is cut
    wider: { flex: 1.4 },
    chips: { flexDirection: 'row', gap: 6 },
    later: { alignItems: 'center', height: 44, justifyContent: 'center', marginTop: 8 },
    laterText: a.link,
  } as const;
}
