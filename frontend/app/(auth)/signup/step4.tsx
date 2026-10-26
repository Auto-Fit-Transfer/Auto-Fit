import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  completeOnboarding,
  getSignupApiErrorMessage,
  saveExercisePreferences,
  saveProfile,
  type ExerciseGoalType,
} from '@/src/api/onboarding';
import { SignUpScreenLayout, SignUpSection } from '@/src/components/auth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import {
  useSignup,
  type SignupExerciseExperience,
  type SignupExerciseGoal,
} from '@/src/features/signup/SignupContext';
import { colors, fontFamilies } from '@/src/theme';
import CheckIcon from '@/assets/icons/auth-redesign/ab4c2.svg';

type ExerciseGoal = SignupExerciseGoal;

type ExerciseExperience = SignupExerciseExperience;

interface GoalOption {
  id: ExerciseGoal;
  label: string;
}
interface ExperienceOption {
  id: ExerciseExperience;
  label: string;
}

const goalOptions: GoalOption[] = [
  { id: 'fat-loss', label: '체지방 감량' },
  { id: 'muscle-gain', label: '근육량 증가' },
  { id: 'stamina', label: '체력 향상' },
  { id: 'conditioning', label: '컨디셔닝 / 기능 회복' },
];
const experienceOptions: ExperienceOption[] = [
  { id: 'beginner', label: '초보 (운동 6개월 미만)' },
  { id: 'intermediate', label: '중급 (6개월 ~ 2년)' },
  { id: 'advanced', label: '고급 (2년 이상)' },
];

const exerciseGoalApiMap: Record<ExerciseGoal, ExerciseGoalType> = {
  'fat-loss': 'weight_loss',
  'muscle-gain': 'muscle_gain',
  stamina: 'endurance',
  conditioning: 'rehabilitation',
  custom: 'other',
};

export default function SignUpStep4Screen() {
  const router = useRouter();
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
    if (goal !== 'custom') {
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
      Alert.alert('운동 목표를 확인해 주세요', '기타 운동 목표를 입력해 주세요.');
      return;
    }
    if (exerciseGoal === 'custom' && trimmedCustomGoal.length > 200) {
      Alert.alert('운동 목표를 확인해 주세요', '운동 목표는 200자 이하로 입력해 주세요.');
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
      ctaLoading={isCompleting}
      contentOffsetY={keyboardContentOffset}
      currentStep={isPostLoginOnboarding ? 3 : 4}
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={() => router.back()}
      onContinue={() => void completeSignup()}
    >
      <SignUpSection top={0} innerStyle={styles.optionSection}>
        <Text style={styles.sectionTitle}>운동 목표</Text>
        <Text style={styles.sectionDescription}>가장 집중하고 싶은 목표를 선택해 주세요.</Text>
        <View style={styles.choiceList}>
          {goalOptions.map((option) => (
            <ChoiceRow
              key={option.id}
              label={option.label}
              onPress={() => selectGoal(option.id)}
              selected={exerciseGoal === option.id}
            />
          ))}
          <CustomGoalInput
            inputRef={customGoalInputRef}
            onBlur={() => {
              setIsCustomGoalFocused(false);
              setKeyboardContentOffset(0);
            }}
            onChangeText={(value) => {
              setCustomGoal(value);
              updateDraft({ customGoal: value });
            }}
            onFocus={() => {
              setExerciseGoal('custom');
              updateDraft({ exerciseGoal: 'custom' });
              setIsCustomGoalFocused(true);
            }}
            selected={exerciseGoal === 'custom'}
            value={customGoal}
          />
        </View>
      </SignUpSection>
      <SignUpSection top={0} innerStyle={styles.optionSection}>
        <Text style={styles.sectionTitle}>운동 경험</Text>
        <Text style={styles.sectionDescription}>현재 본인의 운동 경험 수준을 선택해 주세요.</Text>
        <View style={styles.choiceList}>
          {experienceOptions.map((option) => (
            <ChoiceRow
              key={option.id}
              label={option.label}
              onPress={() => selectExperience(option.id)}
              selected={exerciseExperience === option.id}
            />
          ))}
        </View>
      </SignUpSection>
    </SignUpScreenLayout>
  );
}

function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceLabel, selected && styles.selectedLabel]}>{label}</Text>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <CheckIcon height={14} width={14} /> : null}
      </View>
    </Pressable>
  );
}

function CustomGoalInput({
  selected,
  value,
  inputRef,
  onFocus,
  onBlur,
  onChangeText,
}: {
  selected: boolean;
  value: string;
  inputRef: RefObject<TextInput | null>;
  onFocus: () => void;
  onBlur: () => void;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={[styles.choice, selected && styles.selected]}>
      <TextInput
        ref={inputRef}
        accessibilityLabel="기타 운동 목표"
        maxLength={200}
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder="기타 / 운동 목표를 입력해 주세요"
        placeholderTextColor={colors.textSecondary}
        returnKeyType="done"
        style={[styles.customInput, selected && styles.selectedLabel]}
        value={value}
      />
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <CheckIcon height={14} width={14} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  optionSection: { gap: 8 },
  sectionTitle: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    lineHeight: 26,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
  },
  choiceList: { gap: 8, marginTop: 4 },
  choice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 44,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  selected: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
  choiceLabel: {
    color: colors.dark,
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  selectedLabel: { color: colors.primaryDark },
  radio: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  customInput: {
    color: colors.dark,
    flex: 1,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    height: '100%',
    minWidth: 0,
    padding: 0,
  },
  pressed: { opacity: 0.75 },
});
