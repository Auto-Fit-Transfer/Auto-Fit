import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Keyboard,
  Platform,
  View } from 'react-native';
import { SignUpScreenLayout } from '@/src/components/auth';
import {
  useSignup,
  type SignupExerciseExperience,
  type SignupExerciseGoal,
} from '@/src/features/signup/SignupContext';
import { useThemedStyles } from '@/src/theme';
import { TextInput } from '@/src/components/common';
import { AskCard, AskChip, AskField, AskNote, AskRow } from '@/src/components/b/AskCard';

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
  const styles = useThemedStyles(createStyles);
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
      headline={[[{ text: '운동 목표', mark: true }, { text: '를' }], [{ text: '정해 볼까요?' }]]}
    >
      {/* renewal B (11/27): the goal and the experience as two questions in the black card */}
      <AskCard>
        <AskRow answered={exerciseGoal !== 'custom' || Boolean(customGoal.trim())} first title="목표">
          <View style={styles.choiceList}>
            {goalOptions.map((option) => (
              <AskChip
                key={option.id}
                label={option.label}
                onPress={() => selectGoal(option.id)}
                selected={exerciseGoal === option.id}
                style={option.id === 'conditioning' ? styles.choiceWide : styles.choice}
              />
            ))}
            <AskChip
              label="기타 (직접 적기)"
              onPress={() => {
                setExerciseGoal('custom');
                updateDraft({ exerciseGoal: 'custom' });
              }}
              selected={exerciseGoal === 'custom'}
              style={styles.choice}
            />
          </View>
          {exerciseGoal === 'custom' ? (
            <>
              <AskField
                accessibilityLabel="어떤 목표인가요?"
                inputRef={customGoalInputRef}
                maxLength={30}
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
                unit={`${customGoal.length} / 30`}
                value={customGoal}
              />
              <AskNote>적은 목표에 맞춰 다음 단계에서 몇 가지를 더 물어봐요.</AskNote>
            </>
          ) : null}
        </AskRow>
        <AskRow answered={Boolean(exerciseExperience)} title="운동 경험">
          <View style={styles.experienceRow}>
            {experienceOptions.map((option) => (
              <AskChip
                key={option.id}
                label={option.label}
                onPress={() => selectExperience(option.id)}
                selected={exerciseExperience === option.id}
                style={styles.grow}
              />
            ))}
          </View>
          <AskNote>초보 6개월 미만 · 중급 6개월~2년 · 고급 2년 이상</AskNote>
        </AskRow>
      </AskCard>
    </SignUpScreenLayout>
  );
}

function createStyles() {
  return {
    // three goals in a row, then the long one beside "my own"
    choiceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    choice: { flexBasis: '30%', flexGrow: 1 },
    choiceWide: { flexBasis: '55%', flexGrow: 1 },
    experienceRow: { flexDirection: 'row', gap: 6 },
    grow: { flex: 1 },
  } as const;
}
