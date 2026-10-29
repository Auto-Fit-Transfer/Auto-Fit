import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Keyboard, Platform, Pressable, TextInput, View } from 'react-native';

import CheckIcon from '@/assets/icons/ui/check.svg';
import {
  completeOnboarding,
  getSignupApiErrorMessage,
  saveExercisePreferences,
  saveProfile,
  type ExerciseGoalType,
} from '@/src/api/onboarding';
import { SignUpScreenLayout } from '@/src/components/auth';
import { AuthTextField } from '@/src/components/auth/AuthRedesign';
import { Chip, Text } from '@/src/components/common';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import {
  useSignup,
  type SignupExerciseExperience,
  type SignupExerciseGoal,
} from '@/src/features/signup/SignupContext';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type ExerciseGoal = SignupExerciseGoal;
type ExerciseExperience = SignupExerciseExperience;

const goalOptions: { id: ExerciseGoal; label: string }[] = [
  { id: 'fat-loss', label: '체지방 감량' },
  { id: 'muscle-gain', label: '근육량 증가' },
  { id: 'stamina', label: '체력 향상' },
  { id: 'conditioning', label: '컨디셔닝 · 기능 회복' },
  { id: 'custom', label: '기타 (직접 적기)' },
];
const experienceOptions: { id: ExerciseExperience; label: string }[] = [
  { id: 'beginner', label: '초보' },
  { id: 'intermediate', label: '중급' },
  { id: 'advanced', label: '고급' },
];
const customGoalMaxLength = 30;

const exerciseGoalApiMap: Record<ExerciseGoal, ExerciseGoalType> = {
  'fat-loss': 'weight_loss',
  'muscle-gain': 'muscle_gain',
  stamina: 'endurance',
  conditioning: 'rehabilitation',
  custom: 'other',
};

// Figma A7 (and its "기타 (직접 적기)" state).
export default function SignUpStep4Screen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { draft, resetDraft, updateDraft } = useSignup();
  const customGoalInputRef = useRef<TextInput>(null);
  const completeInFlightRef = useRef(false);
  const [exerciseGoal, setExerciseGoal] = useState<ExerciseGoal>(draft.exerciseGoal);
  const [exerciseExperience, setExerciseExperience] = useState<ExerciseExperience>(
    draft.exerciseExperience,
  );
  const [customGoal, setCustomGoal] = useState(draft.customGoal);
  const [isCustomGoalFocused, setIsCustomGoalFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const isPostLoginOnboarding = flow === 'post-login';

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const keyboardDidShow = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
    });
    const keyboardDidHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardTop(null);
      setKeyboardContentOffset(0);
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isCustomGoalFocused || keyboardTop === null) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      customGoalInputRef.current?.measureInWindow((_x, y, _width, height) => {
        const safeKeyboardTop = keyboardTop - 20;
        setKeyboardContentOffset(Math.max(0, y + height - safeKeyboardTop));
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isCustomGoalFocused, keyboardTop]);

  const selectGoal = (goal: ExerciseGoal) => {
    setExerciseGoal(goal);
    updateDraft({ exerciseGoal: goal });
    if (goal === 'custom') {
      requestAnimationFrame(() => customGoalInputRef.current?.focus());
    } else {
      setIsCustomGoalFocused(false);
      setKeyboardContentOffset(0);
      Keyboard.dismiss();
    }
  };

  const selectExperience = (experience: ExerciseExperience) => {
    setExerciseExperience(experience);
    updateDraft({ exerciseExperience: experience });
  };

  const completeSignup = async () => {
    if (completeInFlightRef.current) return;

    const trimmedCustomGoal = customGoal.trim();
    if (exerciseGoal === 'custom' && !trimmedCustomGoal) {
      Alert.alert('운동 목표를 확인해 주세요', '어떤 목표인지 적어 주세요.');
      return;
    }
    const goalType = exerciseGoalApiMap[exerciseGoal];
    const customGoalForRequest = exerciseGoal === 'custom' ? trimmedCustomGoal : null;
    if (!isPostLoginOnboarding && (!draft.name || !draft.birthDate)) {
      Alert.alert('회원가입 정보가 없습니다', 'Step1부터 회원가입 정보를 다시 입력해 주세요.');
      router.replace('/signup/step1');
      return;
    }

    completeInFlightRef.current = true;
    setIsCompleting(true);
    Keyboard.dismiss();
    try {
      updateDraft({ exerciseGoal, exerciseExperience, customGoal: trimmedCustomGoal });
      if (!isPostLoginOnboarding) {
        await saveProfile({
          name: draft.name,
          birthDate: draft.birthDate!,
          gender: draft.gender,
        });
      }
      await saveExercisePreferences(goalType, exerciseExperience, customGoalForRequest);
      await completeOnboarding();
      resetDraft();
      router.replace(isPostLoginOnboarding ? await getPostLoginDestination() : '/login');
    } catch (error) {
      console.error('회원가입 완료 처리 실패:', error);
      Alert.alert('회원가입을 완료하지 못했습니다', getSignupApiErrorMessage(error));
    } finally {
      completeInFlightRef.current = false;
      setIsCompleting(false);
    }
  };

  return (
    <SignUpScreenLayout
      ctaLabel="회원가입 완료"
      ctaDisabled={exerciseGoal === 'custom' && !customGoal.trim()}
      ctaLoading={isCompleting}
      contentOffsetY={keyboardContentOffset}
      currentStep={isPostLoginOnboarding ? 3 : 4}
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={() => router.back()}
      onContinue={() => void completeSignup()}
    >
      <View accessibilityRole="radiogroup" style={styles.goalList}>
        {goalOptions.map((option) => (
          <GoalRow
            key={option.id}
            label={option.label}
            onPress={() => selectGoal(option.id)}
            selected={exerciseGoal === option.id}
          />
        ))}
        {exerciseGoal === 'custom' ? (
          <AuthTextField
            ref={customGoalInputRef}
            accessibilityLabel="기타 운동 목표"
            containerStyle={styles.customGoal}
            label="어떤 목표인가요?"
            maxLength={customGoalMaxLength}
            onBlur={() => {
              setIsCustomGoalFocused(false);
              setKeyboardContentOffset(0);
            }}
            onChangeText={(value) => {
              setCustomGoal(value);
              updateDraft({ customGoal: value });
            }}
            onFocus={() => setIsCustomGoalFocused(true)}
            placeholder="예) 무릎 수술 뒤 다시 오래 걷기"
            returnKeyType="done"
            rightElement={
              <Text style={styles.counter}>
                {customGoal.length} / {customGoalMaxLength}
              </Text>
            }
            value={customGoal}
          />
        ) : null}
      </View>
      <View style={styles.experience}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          운동 경험
        </Text>
        <View accessibilityRole="radiogroup" style={styles.experienceRow}>
          {experienceOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              onPress={() => selectExperience(option.id)}
              selected={exerciseExperience === option.id}
              style={styles.experienceChip}
            />
          ))}
        </View>
        <Text style={styles.caption}>초보 6개월 미만 · 중급 6개월~2년 · 고급 2년 이상</Text>
      </View>
    </SignUpScreenLayout>
  );
}

function GoalRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.goal,
        selected && styles.goalSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.goalLabel, selected && styles.goalLabelSelected]}>{label}</Text>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <CheckIcon color={colors.onPrimary} height={16} width={16} /> : null}
      </View>
    </Pressable>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  return {
    goalList: { gap: 8 },
    goal: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: easyMode ? 64 : 56,
      paddingHorizontal: 16,
    },
    goalSelected: {
      backgroundColor: colors.background,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    goalLabel: { ...text.body1, color: colors.textBody, flex: 1 },
    goalLabelSelected: { ...text.body1Strong, color: colors.textPrimary },
    radio: {
      alignItems: 'center',
      borderColor: colors.textDisabled,
      borderRadius: 12,
      borderWidth: 1.5,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    customGoal: { marginTop: 8 },
    counter: { ...text.caption, color: colors.textSecondary },
    experience: { gap: 12 },
    sectionTitle: { ...text.body1Strong, color: colors.textPrimary },
    experienceRow: { flexDirection: 'row', gap: 8 },
    experienceChip: { flex: 1 },
    caption: { ...text.caption, color: colors.textSecondary },
    pressed: { opacity: 0.75 },
  } as const;
}
