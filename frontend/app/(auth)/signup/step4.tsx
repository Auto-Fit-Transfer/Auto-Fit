import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SignUpScreenLayout } from '@/src/components/auth';
import {
  useSignup,
  type SignupExerciseExperience,
  type SignupExerciseGoal,
} from '@/src/features/signup/SignupContext';
import { fontFamilies } from '@/src/theme';
import CheckIcon from '@/assets/icons/auth-redesign/ab4c2.svg';
import { Text } from '@/src/components/common';

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
  { id: 'conditioning', label: '컨디셔닝 · 기능 회복' },
];
const experienceOptions: ExperienceOption[] = [
  { id: 'beginner', label: '초보' },
  { id: 'intermediate', label: '중급' },
  { id: 'advanced', label: '고급' },
];

export default function SignUpStep4Screen() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { draft, updateDraft } = useSignup();
  const customGoalInputRef = useRef<TextInput>(null);
  const [exerciseGoal, setExerciseGoal] = useState<ExerciseGoal>(draft.exerciseGoal);
  const [exerciseExperience, setExerciseExperience] = useState<ExerciseExperience>(
    draft.exerciseExperience,
  );
  const [customGoal, setCustomGoal] = useState(draft.customGoal);
  const [isCustomGoalFocused, setIsCustomGoalFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
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

  const goNext = () => {
    const trimmedCustomGoal = customGoal.trim();
    if (exerciseGoal === 'custom' && !trimmedCustomGoal) {
      Alert.alert('운동 목표를 확인해 주세요', '기타 운동 목표를 입력해 주세요.');
      return;
    }
    if (exerciseGoal === 'custom' && trimmedCustomGoal.length > 200) {
      Alert.alert('운동 목표를 확인해 주세요', '운동 목표는 200자 이하로 입력해 주세요.');
      return;
    }
    Keyboard.dismiss();
    updateDraft({ exerciseGoal, exerciseExperience, customGoal: trimmedCustomGoal });
    router.push(
      isPostLoginOnboarding
        ? { pathname: '/signup/step5', params: { flow: 'post-login' } }
        : '/signup/step5',
    );
  };

  return (
    <SignUpScreenLayout
      ctaLabel="다음"
      contentOffsetY={keyboardContentOffset}
      currentStep={isPostLoginOnboarding ? 3 : 4}
      totalSteps={isPostLoginOnboarding ? 4 : 5}
      onBack={() => router.back()}
      onContinue={goNext}
    >
      <View style={styles.choiceList}>
        {goalOptions.map((option) => (
          <ChoiceRow
            key={option.id}
            label={option.label}
            onPress={() => selectGoal(option.id)}
            selected={exerciseGoal === option.id}
          />
        ))}
        <ChoiceRow
          label="기타 (직접 적기)"
          onPress={() => {
            setExerciseGoal('custom');
            updateDraft({ exerciseGoal: 'custom' });
          }}
          selected={exerciseGoal === 'custom'}
        />
        {exerciseGoal === 'custom' ? (
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
            onFocus={() => setIsCustomGoalFocused(true)}
            value={customGoal}
          />
        ) : null}
      </View>
      <View>
        <Text style={styles.sectionTitle}>운동 경험</Text>
        <View style={styles.experienceRow}>
          {experienceOptions.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: exerciseExperience === option.id }}
              onPress={() => selectExperience(option.id)}
              style={({ pressed }) => [
                styles.chip,
                exerciseExperience === option.id && styles.chipSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, exerciseExperience === option.id && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.experienceHint}>초보 6개월 미만 · 중급 6개월~2년 · 고급 2년 이상</Text>
      </View>
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
        {selected ? <CheckIcon height={16} width={16} /> : null}
      </View>
    </Pressable>
  );
}

function CustomGoalInput({
  value,
  inputRef,
  onFocus,
  onBlur,
  onChangeText,
}: {
  value: string;
  inputRef: RefObject<TextInput | null>;
  onFocus: () => void;
  onBlur: () => void;
  onChangeText: (value: string) => void;
}) {
  return (
    <View>
      <Text style={styles.customLabel}>어떤 목표인가요?</Text>
      <View style={styles.customField}>
        <TextInput
          ref={inputRef}
          accessibilityLabel="어떤 목표인가요?"
          maxLength={30}
          onBlur={onBlur}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder="예) 무릎 수술 뒤 다시 오래 걷기"
          placeholderTextColor="#5E5D66"
          returnKeyType="done"
          style={styles.customInput}
          value={value}
        />
        <Text style={styles.customCount}>{value.length} / 30</Text>
      </View>
      <Text style={styles.customHint}>적은 목표에 맞춰 다음 단계에서 몇 가지를 더 물어봐요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: '#17161D',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10,
  },
  choiceList: { gap: 8 },
  choice: {
    alignItems: 'center',
    backgroundColor: '#FAFBFC',
    borderColor: '#DFE2E7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-between',
    paddingHorizontal: 19,
  },
  selected: { borderColor: '#5246C6' },
  choiceLabel: {
    color: '#17161D',
    flex: 1,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 16,
    lineHeight: 24,
  },
  selectedLabel: { fontFamily: fontFamilies.pretendardBold },
  radio: {
    alignItems: 'center',
    borderColor: '#8E8D95',
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  radioSelected: { backgroundColor: '#5246C6', borderColor: '#5246C6' },
  experienceRow: { flexDirection: 'row', gap: 8 },
  chip: {
    alignItems: 'center',
    backgroundColor: '#FAFBFC',
    borderColor: '#DFE2E7',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: '#5246C6', borderColor: '#5246C6' },
  chipText: { color: '#3B3A42', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  chipTextSelected: { color: '#FFFFFF' },
  experienceHint: {
    color: '#5E5D66',
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  customLabel: {
    color: '#17161D',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
    marginTop: 8,
  },
  customField: {
    alignItems: 'center',
    backgroundColor: '#FAFBFC',
    borderColor: '#5246C6',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    paddingHorizontal: 16,
  },
  customInput: {
    color: '#17161D',
    flex: 1,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 16,
    height: '100%',
    minWidth: 0,
    padding: 0,
  },
  customCount: { color: '#5E5D66', fontSize: 14 },
  customHint: {
    color: '#5E5D66',
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  pressed: { opacity: 0.75 },
});
