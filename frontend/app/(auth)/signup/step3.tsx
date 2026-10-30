import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { getSignupApiErrorMessage, saveAllergies } from '@/src/api/onboarding';
import { SignUpScreenLayout, SignUpSection } from '@/src/components/auth';
import { useSignup } from '@/src/features/signup/SignupContext';
import { colors, fontFamilies } from '@/src/theme';
import OtherIcon from '@/assets/icons/auth-redesign/00654.svg';

interface AllergenOption {
  id: string;
  label: string;
}

const allergenOptions: AllergenOption[] = [
  { id: 'milk', label: '우유' },
  { id: 'egg', label: '계란' },
  { id: 'peanut', label: '땅콩' },
  { id: 'nuts', label: '견과류' },
  { id: 'wheat', label: '밀(글루텐)' },
  { id: 'buckwheat', label: '메밀' },
  { id: 'soybean', label: '콩(대두)' },
  { id: 'peach', label: '복숭아' },
  { id: 'fish', label: '생선' },
  { id: 'crab', label: '갑각류' },
  { id: 'shellfish', label: '조개' },
  { id: 'sesame', label: '참깨' },
];

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
  const descriptionHeight = referenceDescriptionHeight;
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
      ctaLabel="다음"
      ctaLoading={isSaving}
      contentOffsetY={keyboardContentOffset}
      currentStep={isPostLoginOnboarding ? 2 : 3}
      totalSteps={isPostLoginOnboarding ? 4 : 5}
      onBack={() => router.back()}
      onContinue={() => void goNext()}
    >
      <SignUpSection top={protectedDescriptionTop} innerStyle={styles.allergyCard}>
        <View style={styles.allergenGrid}>
          {allergenOptions.map((option) => (
            <AllergenButton
              key={option.id}
              onPress={() => toggleAllergen(option.id)}
              option={option}
              selected={selectedAllergens.includes(option.id)}
            />
          ))}
        </View>
      </SignUpSection>
      <SignUpSection top={responsiveOtherCardTop} innerStyle={styles.otherCard}>
        <Text style={styles.otherTitle}>기타 알레르기가 있으신가요?</Text>
        <View style={styles.otherField}>
          <OtherIcon height={20} width={20} />
          <TextInput
            ref={otherAllergyInputRef}
            accessibilityLabel="기타 알레르기"
            onChangeText={setOtherAllergy}
            onBlur={() => {
              setIsOtherAllergyFocused(false);
              setKeyboardContentOffset(0);
            }}
            onFocus={() => setIsOtherAllergyFocused(true)}
            placeholder="직접 입력해 주세요 (선택 사항)"
            placeholderTextColor={colors.textSecondary}
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
      <Text style={[styles.allergenLabel, selected && styles.allergenLabelSelected]}>
        {option.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  allergyCard: { gap: 16 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    lineHeight: 26,
  },
  titleAside: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    lineHeight: 23,
  },
  allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergenButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  allergenButtonSelected: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
  allergenLabel: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  allergenLabelSelected: { color: colors.primaryDark },
  otherCard: { gap: 8 },
  otherTitle: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  otherField: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
  },
  otherInput: {
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
