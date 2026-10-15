import { useEffect, useId, useRef, useState, type ComponentType, type RefObject } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Svg, { Defs, Mask, Rect, type SvgProps } from 'react-native-svg';

import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import MedalIcon from '@/assets/icons/deco/Medal.svg';
import PlantIcon from '@/assets/icons/deco/Plant.svg';
import TargetIcon from '@/assets/icons/deco/Target.svg';
import ChartBarIcon from '@/assets/icons/graph/ChartBar.svg';
import CheckCircleIcon from '@/assets/icons/system/CheckCircle_Fill.svg';
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
import { colors, fontFamilies, radius } from '@/src/theme';

const bodyFatLossImage = require('../../../assets/images/illustrations/exercise/goals/Body_Fat_Loss.png');
const bodyFatLossGrayImage = require('../../../assets/images/illustrations/exercise/goals/Body_Fat_Loss_Gray.png');
const muscleGainImage = require('../../../assets/images/illustrations/exercise/goals/Muscle_Gain.png');
const muscleGainGrayImage = require('../../../assets/images/illustrations/exercise/goals/Muscle_Gain_Gray.png');
const staminaImage = require('../../../assets/images/illustrations/exercise/goals/Stamina_Improvement.png');
const staminaGrayImage = require('../../../assets/images/illustrations/exercise/goals/Stamina_Improvement_Gray.png');
const healthImage = require('../../../assets/images/illustrations/exercise/goals/Health_Maintenance.png');
const healthGrayImage = require('../../../assets/images/illustrations/exercise/goals/Health_Maintenance_Gray.png');
const conditioningImage = require('../../../assets/images/illustrations/exercise/goals/Rehab_Conditioning.png');
const conditioningGrayImage = require('../../../assets/images/illustrations/exercise/goals/Rehab_Conditioning_Gray.png');

const minimumScreenHeight = 740;
const maximumScreenHeight = 917;

type ExerciseGoal = SignupExerciseGoal;

type ExerciseExperience = SignupExerciseExperience;

interface GoalOption {
  id: ExerciseGoal;
  label: string;
  image: ImageSourcePropType;
  grayImage: ImageSourcePropType;
}

interface ExperienceOption {
  id: ExerciseExperience;
  label: string;
  description: string;
  icon: ComponentType<SvgProps>;
}

const goalOptions: GoalOption[] = [
  {
    id: 'fat-loss',
    label: '체지방 감량',
    image: bodyFatLossImage,
    grayImage: bodyFatLossGrayImage,
  },
  {
    id: 'muscle-gain',
    label: '근육량 증가',
    image: muscleGainImage,
    grayImage: muscleGainGrayImage,
  },
  {
    id: 'stamina',
    label: '체력 향상',
    image: staminaImage,
    grayImage: staminaGrayImage,
  },
  {
    id: 'conditioning',
    label: '컨디셔닝 / 기능 회복',
    image: conditioningImage,
    grayImage: conditioningGrayImage,
  },
];

const experienceOptions: ExperienceOption[] = [
  { id: 'beginner', label: '초보', description: '(운동 6개월 미만)', icon: PlantIcon },
  { id: 'intermediate', label: '중급', description: '(6개월 ~ 2년)', icon: BarbellIcon },
  { id: 'advanced', label: '고급', description: '(2년 이상)', icon: MedalIcon },
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
  const { height: windowHeight } = useWindowDimensions();
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
  const screenHeight = Dimensions.get('screen').height;
  const responsiveHeight = Platform.OS === 'android' ? screenHeight : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(
      1,
      (responsiveHeight - minimumScreenHeight) / (maximumScreenHeight - minimumScreenHeight),
    ),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;

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
      ctaTop={verticalValue(830, 772)}
      contentOffsetY={keyboardContentOffset}
      currentStep={isPostLoginOnboarding ? 3 : 4}
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={() => router.back()}
      onContinue={() => void completeSignup()}
    >
      <SignUpSection innerStyle={styles.content} top={verticalValue(285, 242)}>
        <View style={styles.optionSection}>
          <SectionHeading
            description="가장 집중하고 싶은 목표를 선택해주세요"
            icon={TargetIcon}
            title="운동 목표"
          />
          <View style={styles.goalList}>
            {goalOptions.map((option) => (
              <GoalButton
                key={option.id}
                onPress={() => selectGoal(option.id)}
                option={option}
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
        </View>

        <View style={styles.optionSection}>
          <SectionHeading
            description="현재 본인의 운동 경험 수준을 선택해주세요"
            icon={ChartBarIcon}
            title="운동 경험"
          />
          <View style={styles.experienceRow}>
            {experienceOptions.map((option) => (
              <ExperienceButton
                key={option.id}
                onPress={() => selectExperience(option.id)}
                option={option}
                selected={exerciseExperience === option.id}
              />
            ))}
          </View>
        </View>
      </SignUpSection>
    </SignUpScreenLayout>
  );
}

function SectionHeading({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ComponentType<SvgProps>;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionTitleRow}>
        <TintedIcon color={colors.primaryDark} icon={icon} size={25} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
  );
}

function GoalButton({
  option,
  selected,
  onPress,
}: {
  option: GoalOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.goalButton,
        selected && styles.selectedButton,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.goalLeft}>
        <Image
          resizeMode="contain"
          source={selected ? option.image : option.grayImage}
          style={styles.goalImage}
        />
        <Text style={[styles.goalLabel, selected && styles.selectedLabel]}>{option.label}</Text>
      </View>
      {selected ? <TintedIcon color={colors.primary} icon={CheckCircleIcon} size={25} /> : null}
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
    <View style={[styles.goalButton, selected && styles.selectedButton]}>
      <View style={styles.goalLeft}>
        <Image
          resizeMode="contain"
          source={selected ? healthImage : healthGrayImage}
          style={styles.goalImage}
        />
        <TextInput
          ref={inputRef}
          accessibilityLabel="기타 운동 목표"
          onBlur={onBlur}
          onChangeText={onChangeText}
          onFocus={onFocus}
          maxLength={200}
          placeholder="기타 / 운동 목표를 입력해 주세요"
          placeholderTextColor={colors.textDisabled}
          returnKeyType="done"
          style={[styles.customGoalInput, selected && styles.selectedLabel]}
          value={value}
        />
      </View>
      {selected ? <TintedIcon color={colors.primary} icon={CheckCircleIcon} size={25} /> : null}
    </View>
  );
}

function ExperienceButton({
  option,
  selected,
  onPress,
}: {
  option: ExperienceOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.experienceButton,
        selected && styles.selectedButton,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <View style={styles.experienceCheck}>
          <TintedIcon color={colors.primary} icon={CheckCircleIcon} size={25} />
        </View>
      ) : null}
      <View
        style={[
          styles.experienceIcon,
          selected ? styles.experienceIconSelected : styles.experienceIconUnselected,
        ]}
      >
        <TintedIcon
          color={selected ? colors.primary : colors.textSecondary}
          icon={option.icon}
          size={25}
        />
      </View>
      <View style={styles.experienceCopy}>
        <Text style={[styles.experienceLabel, selected && styles.selectedLabel]}>
          {option.label}
        </Text>
        <Text style={[styles.experienceDescription, selected && styles.selectedLabel]}>
          {option.description}
        </Text>
      </View>
    </Pressable>
  );
}

function TintedIcon({
  icon: Icon,
  color,
  size,
}: {
  icon: ComponentType<SvgProps>;
  color: string;
  size: number;
}) {
  const maskId = `signup-step4-icon-${useId().replace(/:/g, '')}`;

  return (
    <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <Defs>
        <Mask
          height={size}
          id={maskId}
          maskUnits="userSpaceOnUse"
          style={{ maskType: 'alpha' }}
          width={size}
          x={0}
          y={0}
        >
          <Icon height={size} width={size} />
        </Mask>
      </Defs>
      <Rect fill={color} height={size} mask={`url(#${maskId})`} width={size} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 15,
  },
  optionSection: {
    gap: 15,
  },
  sectionHeading: {
    gap: 4,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    height: 25,
  },
  sectionTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 22,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 17,
  },
  goalList: {
    height: 260,
    justifyContent: 'space-between',
  },
  goalButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    height: 45,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  selectedButton: {
    backgroundColor: '#F5FFFC',
    borderColor: colors.primary,
  },
  goalLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  goalImage: {
    height: 30,
    width: 30,
  },
  goalLabel: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 19,
  },
  customGoalInput: {
    color: colors.textBody,
    flex: 1,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    height: '100%',
    includeFontPadding: false,
    lineHeight: 19,
    minWidth: 0,
    padding: 0,
  },
  selectedLabel: {
    color: colors.primaryDark,
  },
  experienceRow: {
    flexDirection: 'row',
    gap: 5,
    height: 120,
  },
  experienceButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    height: 120,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
  },
  experienceCheck: {
    position: 'absolute',
    right: 5,
    top: 3,
  },
  experienceIcon: {
    alignItems: 'center',
    borderRadius: radius.round,
    height: 35,
    justifyContent: 'center',
    width: 35,
  },
  experienceIconSelected: {
    backgroundColor: '#D8F7EF',
  },
  experienceIconUnselected: {
    backgroundColor: '#EDEDED',
  },
  experienceCopy: {
    alignItems: 'center',
  },
  experienceLabel: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 15,
    textAlign: 'center',
  },
  experienceDescription: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 15,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
