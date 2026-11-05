import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  TextInput,
  View } from 'react-native';
import { getSignupApiErrorMessage, saveAllergies } from '@/src/api/onboarding';
import { SignUpScreenLayout } from '@/src/components/auth';
import { useSignup } from '@/src/features/signup/SignupContext';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import NoticeIcon from '@/assets/icons/auth-redesign/info-circle.svg';
import { Text } from '@/src/components/common';

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
  { id: 'soybean', label: '콩(대두)' },
  { id: 'buckwheat', label: '메밀' },
  { id: 'crab', label: '갑각류' },
  { id: 'shellfish', label: '조개' },
  { id: 'fish', label: '생선' },
  { id: 'peach', label: '복숭아' },
  { id: 'sesame', label: '참깨' },
];

const keyboardSafeGap = 20;

export default function SignUpStep3Screen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLoginOnboarding = flow === 'post-login';
  const { draft, updateDraft } = useSignup();
  const otherAllergyInputRef = useRef<TextInput>(null);
  const saveInFlightRef = useRef(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(draft.selectedAllergens);
  const [otherAllergy, setOtherAllergy] = useState(draft.otherAllergy);
  const [noneChosen, setNoneChosen] = useState(false);
  const [isOtherAllergyFocused, setIsOtherAllergyFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

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
      <View style={styles.allergenGrid}>
        <AllergenButton
          onPress={() => {
            setNoneChosen(true);
            setSelectedAllergens([]);
          }}
          option={{ id: 'none', label: '없어요' }}
          selected={noneChosen && selectedAllergens.length === 0}
        />
        {allergenOptions.map((option) => (
          <AllergenButton
            key={option.id}
            onPress={() => toggleAllergen(option.id)}
            option={option}
            selected={selectedAllergens.includes(option.id)}
          />
        ))}
      </View>
      <View>
        <Text style={styles.otherTitle}>그 밖의 알레르기 (선택)</Text>
        <TextInput
          ref={otherAllergyInputRef}
          accessibilityLabel="그 밖의 알레르기"
          onChangeText={setOtherAllergy}
          onBlur={() => {
            setIsOtherAllergyFocused(false);
            setKeyboardContentOffset(0);
          }}
          onFocus={() => setIsOtherAllergyFocused(true)}
          placeholder="예) 키위, 토마토"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          style={styles.otherInput}
          value={otherAllergy}
        />
      </View>
      <View style={styles.notice}>
        <NoticeIcon height={20} width={20} />
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>참고용 정보예요</Text>
          <Text style={styles.noticeText}>음식을 먹기 전에는 성분표를 꼭 확인해 주세요.</Text>
        </View>
      </View>
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
  const styles = useThemedStyles(createStyles);
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

function createStyles({ colors }: AppTheme) {
  return {
    allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    allergenButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      minWidth: 80,
      paddingHorizontal: 10,
    },
    allergenButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    allergenLabel: {
      color: colors.textBody,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    allergenLabelSelected: { color: '#FFFFFF' },
    otherTitle: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 8,
    },
    otherInput: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 16,
      height: 52,
      paddingHorizontal: 16,
    },
    notice: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 16,
    },
    noticeCopy: { flex: 1, gap: 2 },
    noticeTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 21 },
    noticeText: { color: colors.textBody, fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
    pressed: { opacity: 0.75 },
  } as const;
}
