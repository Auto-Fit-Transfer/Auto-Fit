import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native';

import { getSignupApiErrorMessage, saveAllergies } from '@/src/api/onboarding';
import { SignUpScreenLayout } from '@/src/components/auth';
import { AuthTextField } from '@/src/components/auth/AuthRedesign';
import { Chip, Notice } from '@/src/components/common';
import { useSignup } from '@/src/features/signup/SignupContext';
import { useAppTheme } from '@/src/theme';

// Order from the Figma A6 chips; the ids are what the server stores.
const allergenOptions = [
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
] as const;

const noneChip = { id: 'none', label: '없어요' } as const;
const keyboardSafeGap = 20;

// Figma A6.
export default function SignUpStep3Screen() {
  const router = useRouter();
  const { easyMode } = useAppTheme();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLoginOnboarding = flow === 'post-login';
  const { draft, updateDraft } = useSignup();
  const otherAllergyInputRef = useRef<TextInput>(null);
  const saveInFlightRef = useRef(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(draft.selectedAllergens);
  const [noAllergy, setNoAllergy] = useState(false);
  const [otherAllergy, setOtherAllergy] = useState(draft.otherAllergy);
  const [isOtherAllergyFocused, setIsOtherAllergyFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  // Four chips a row as in Figma; three in the easy mode so the larger labels still fit.
  const columns = easyMode ? 3 : 4;
  const chips = [noneChip, ...allergenOptions];
  const rows = Array.from({ length: Math.ceil(chips.length / columns) }, (_, index) =>
    chips.slice(index * columns, index * columns + columns),
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

  // "없어요" clears the other chips, and choosing any allergen clears "없어요".
  const toggleChip = (id: string) => {
    if (id === noneChip.id) {
      setNoAllergy((value) => !value);
      setSelectedAllergens([]);
      return;
    }
    setNoAllergy(false);
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
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={() => router.back()}
      onContinue={() => void goNext()}
    >
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                onPress={() => toggleChip(chip.id)}
                selected={chip.id === noneChip.id ? noAllergy : selectedAllergens.includes(chip.id)}
                style={styles.chip}
              />
            ))}
            {Array.from({ length: columns - row.length }, (_, index) => (
              <View key={`empty-${index}`} style={styles.chip} />
            ))}
          </View>
        ))}
      </View>
      <AuthTextField
        ref={otherAllergyInputRef}
        accessibilityLabel="그 밖의 알레르기"
        label="그 밖의 알레르기 (선택)"
        maxLength={50}
        onBlur={() => {
          setIsOtherAllergyFocused(false);
          setKeyboardContentOffset(0);
        }}
        onChangeText={(value) => {
          setOtherAllergy(value);
          if (value.trim()) setNoAllergy(false);
        }}
        onFocus={() => setIsOtherAllergyFocused(true)}
        placeholder="예) 키위, 토마토"
        returnKeyType="done"
        value={otherAllergy}
      />
      <Notice body="음식을 먹기 전에는 성분표를 꼭 확인해 주세요." title="참고용 정보예요" />
    </SignUpScreenLayout>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
});
