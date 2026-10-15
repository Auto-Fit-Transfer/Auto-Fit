import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop, type SvgProps } from 'react-native-svg';

import BreadIcon from '@/assets/icons/food/Bread.svg';
import BuckwheatIcon from '@/assets/icons/food/Buckwheat.svg';
import CrabIcon from '@/assets/icons/food/Crab.svg';
import EggsIcon from '@/assets/icons/food/Eggs.svg';
import FishIcon from '@/assets/icons/food/Fish.svg';
import MilkIcon from '@/assets/icons/food/Milk.svg';
import NutsIcon from '@/assets/icons/food/Nuts.svg';
import PeachIcon from '@/assets/icons/food/Peach.svg';
import PeanutIcon from '@/assets/icons/food/Peanut.svg';
import SesameIcon from '@/assets/icons/food/Sesame.svg';
import ShellfishIcon from '@/assets/icons/food/Shellfish.svg';
import SoybeanIcon from '@/assets/icons/food/Soybean.svg';
import CheckCircleFillIcon from '@/assets/icons/system/CheckCircle_Fill.svg';
import WarningIcon from '@/assets/icons/system/WarningCircle.svg';
import { getSignupApiErrorMessage, saveAllergies } from '@/src/api/onboarding';
import { SignUpScreenLayout, SignUpSection } from '@/src/components/auth';
import { useSignup } from '@/src/features/signup/SignupContext';
import { colors, fontFamilies, radius, typography } from '@/src/theme';

interface AllergenOption {
  id: string;
  label: string;
  icon: ComponentType<SvgProps>;
}

const allergenOptions: AllergenOption[] = [
  { id: 'milk', label: '우유', icon: MilkIcon },
  { id: 'egg', label: '계란', icon: EggsIcon },
  { id: 'peanut', label: '땅콩', icon: PeanutIcon },
  { id: 'nuts', label: '견과류', icon: NutsIcon },
  { id: 'wheat', label: '밀(글루텐)', icon: BreadIcon },
  { id: 'buckwheat', label: '메밀', icon: BuckwheatIcon },
  { id: 'soybean', label: '콩(대두)', icon: SoybeanIcon },
  { id: 'peach', label: '복숭아', icon: PeachIcon },
  { id: 'fish', label: '생선', icon: FishIcon },
  { id: 'crab', label: '갑각류', icon: CrabIcon },
  { id: 'shellfish', label: '조개', icon: ShellfishIcon },
  { id: 'sesame', label: '참깨', icon: SesameIcon },
];

const otherCardShadow: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0 0 1.5px rgba(0, 0, 0, 0.05)' }
    : {
        elevation: 1,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 1.5,
      };

const descriptionTop = 285;
const allergenGridTop = 397;
const allergenGridHeight = 230;
const otherCardTop = 644;
const referenceDescriptionHeight = 44;
const minimumScreenHeight = 740;
const maximumScreenHeight = 917;
const keyboardSafeGap = 20;
const signUpBrandVisualHeight = 144;

export default function SignUpStep3Screen() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLoginOnboarding = flow === 'post-login';
  const { draft, updateDraft } = useSignup();
  const { height: windowHeight } = useWindowDimensions();
  const otherAllergyInputRef = useRef<TextInput>(null);
  const saveInFlightRef = useRef(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(draft.selectedAllergens);
  const [otherAllergy, setOtherAllergy] = useState(draft.otherAllergy);
  const [descriptionHeight, setDescriptionHeight] = useState(referenceDescriptionHeight);
  const [isOtherAllergyFocused, setIsOtherAllergyFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
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
  const explanationGap = verticalValue(30, 20);
  const explanationBottomGap = verticalValue(18, 10);
  const otherCardGap = verticalValue(17, 12);

  const explanationHeight = 20 + explanationGap + descriptionHeight;
  const signUpBrandBottom = verticalValue(96, 74) + signUpBrandVisualHeight;

  const responsiveDescriptionTop = Math.min(
    verticalValue(descriptionTop, 215),
    verticalValue(allergenGridTop, 346) - explanationHeight - explanationBottomGap,
  );
  const protectedDescriptionTop = Math.max(responsiveDescriptionTop, signUpBrandBottom + 12);
  const responsiveAllergenGridTop = Math.max(
    verticalValue(allergenGridTop, 346),
    protectedDescriptionTop + explanationHeight + explanationBottomGap,
  );

  const responsiveOtherCardTop = Math.max(
    verticalValue(otherCardTop, 588),
    responsiveAllergenGridTop + allergenGridHeight + otherCardGap,
  );
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
    if (Platform.OS !== 'android' || !isOtherAllergyFocused || keyboardTop === null)
      return undefined;

    const frame = requestAnimationFrame(() => {
      otherAllergyInputRef.current?.measureInWindow((_x, y, _width, height) => {
        const hiddenAmount = y + height - (keyboardTop - keyboardSafeGap);
        setKeyboardContentOffset(Math.max(0, hiddenAmount));
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOtherAllergyFocused, keyboardTop]);

  const toggleAllergen = (id: string) => {
    setSelectedAllergens((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const goNext = async () => {
    if (saveInFlightRef.current) return;
    if (otherAllergy.trim().length > 50) {
      Alert.alert('기타 알레르기를 확인해 주세요', '기타 알레르기는 50자 이하로 입력해 주세요.');
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    Keyboard.dismiss();
    try {
      await saveAllergies(selectedAllergens, otherAllergy);
      updateDraft({ selectedAllergens, otherAllergy: otherAllergy.trim() });
      router.push(
        flow === 'post-login'
          ? { pathname: '/signup/step4', params: { flow: 'post-login' } }
          : '/signup/step4',
      );
    } catch (error) {
      console.error('알레르기 저장 실패:', error);
      Alert.alert('알레르기 정보를 저장하지 못했습니다', getSignupApiErrorMessage(error));
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <SignUpScreenLayout
      alignStepCta
      ctaLabel="다음"
      ctaLoading={isSaving}
      contentOffsetY={keyboardContentOffset}
      currentStep={isPostLoginOnboarding ? 2 : 3}
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={() => router.back()}
      onContinue={() => void goNext()}
    >
      <SignUpSection
        innerStyle={[styles.explanation, { gap: explanationGap }]}
        top={protectedDescriptionTop}
      >
        <Text style={styles.sectionTitle}>
          알레르기 정보 <Text style={styles.titleAside}>(복수 선택 가능)</Text>
        </Text>
        <Text
          onLayout={(event) => setDescriptionHeight(event.nativeEvent.layout.height)}
          style={styles.description}
        >
          알레르기 정보는 더 정확한 식단 추천을 위해 활용돼요.{`\n`}나중에 프로필에서 정보를 수정할
          수 있어요.
        </Text>
      </SignUpSection>

      <SignUpSection innerStyle={styles.allergenGrid} top={responsiveAllergenGridTop}>
        {[0, 1, 2].map((rowIndex) => (
          <View key={rowIndex} style={styles.allergenRow}>
            {allergenOptions.slice(rowIndex * 4, rowIndex * 4 + 4).map((option) => (
              <AllergenButton
                key={option.id}
                onPress={() => toggleAllergen(option.id)}
                option={option}
                selected={selectedAllergens.includes(option.id)}
              />
            ))}
          </View>
        ))}
      </SignUpSection>

      <SignUpSection innerStyle={styles.otherCard} top={responsiveOtherCardTop}>
        <View style={styles.otherTitleRow}>
          <WarningIcon color={colors.primaryDark} height={25} width={25} />
          <Text style={styles.otherTitle}>기타 알레르기가 있으신가요?</Text>
        </View>
        <View style={styles.otherInputIndent}>
          <TextInput
            ref={otherAllergyInputRef}
            accessibilityLabel="기타 알레르기"
            onChangeText={setOtherAllergy}
            onBlur={() => {
              setIsOtherAllergyFocused(false);
              setKeyboardContentOffset(0);
            }}
            onFocus={() => setIsOtherAllergyFocused(true)}
            placeholder="직접 입력해주세요 (선택 사항)"
            placeholderTextColor={colors.textDisabled}
            returnKeyType="done"
            style={styles.otherInput}
            value={otherAllergy}
          />
        </View>
      </SignUpSection>
    </SignUpScreenLayout>
  );
}

function AllergenButton({
  option,
  selected,
  onPress,
}: {
  option: AllergenOption;
  selected: boolean;
  onPress: () => void;
}) {
  const AllergenIcon = option.icon;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.allergenButton,
        selected && styles.allergenButtonSelected,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <View style={styles.selectionMark}>
          <GradientCheckMark />
        </View>
      ) : null}
      <AllergenIcon
        color={selected ? colors.primary : colors.textSecondary}
        height={35}
        width={35}
      />
      <Text style={[styles.allergenLabel, selected && styles.allergenLabelSelected]}>
        {option.label}
      </Text>
    </Pressable>
  );
}

function GradientCheckMark() {
  const id = useId().replace(/:/g, '');
  const gradientId = `check-gradient-${id}`;
  const maskId = `check-mask-${id}`;

  return (
    <Svg height={15} viewBox="0 0 15 15" width={15}>
      <Defs>
        <LinearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          x1="10.8516"
          x2="3.6914"
          y1="2.625"
          y2="12.375"
        >
          <Stop offset="0" stopColor="#49CDB1" />
          <Stop offset="0.2" stopColor="#42C0A6" />
          <Stop offset="0.4" stopColor="#49CDB1" />
          <Stop offset="0.600962" stopColor="#42C0A6" />
          <Stop offset="0.8" stopColor="#49CDB1" />
          <Stop offset="1" stopColor="#42C0A6" />
        </LinearGradient>
        <Mask height={15} id={maskId} maskUnits="userSpaceOnUse" width={15} x={0} y={0}>
          <CheckCircleFillIcon color="#FFFFFF" height={15} width={15} />
        </Mask>
      </Defs>
      <Rect fill={`url(#${gradientId})`} height={15} mask={`url(#${maskId})`} width={15} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  explanation: {
    gap: 30,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.textBody,
    fontSize: 18,
    height: 20,
    includeFontPadding: false,
    lineHeight: 20,
  },
  titleAside: {
    color: colors.textBody,
    fontSize: 14,
  },
  description: {
    ...typography.body,
    color: colors.textBody,
    flexShrink: 1,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 22,
    width: '100%',
  },
  allergenGrid: {
    gap: 10,
    height: 230,
  },
  allergenRow: {
    flexDirection: 'row',
    gap: 10,
    height: 70,
  },
  allergenButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 70,
    justifyContent: 'space-between',
    maxWidth: 80,
    paddingBottom: 5,
    paddingHorizontal: 4,
    paddingTop: 10,
    position: 'relative',
  },
  allergenButtonSelected: {
    borderColor: colors.primary,
  },
  selectionMark: {
    position: 'absolute',
    right: 3,
    top: 2,
  },
  allergenLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    includeFontPadding: false,
    lineHeight: 22,
    textAlign: 'center',
  },
  allergenLabelSelected: {
    color: colors.primary,
  },
  otherCard: {
    ...otherCardShadow,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.lg,
    height: 100,
    justifyContent: 'space-between',
    paddingBottom: 9,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  otherTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  otherTitle: {
    ...typography.label,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 22,
  },
  otherInputIndent: {
    width: '100%',
  },
  otherInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    height: 50,
    includeFontPadding: false,
    lineHeight: 22,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  pressed: {
    opacity: 0.75,
  },
});
