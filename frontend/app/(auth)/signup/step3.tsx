import { logError } from '@/src/lib/logError';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Keyboard,
  Platform,
  View } from 'react-native';
import { getSignupApiErrorMessage, saveAllergies } from '@/src/api/onboarding';
import { SignUpScreenLayout } from '@/src/components/auth';
import { useSignup } from '@/src/features/signup/SignupContext';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { AskCard, AskChip, AskRow } from '@/src/components/b/AskCard';
import { aForm } from '@/src/components/a/form';
import { Text, TextInput } from '@/src/components/common';

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
      logError('알레르기 저장 실패', error);
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
      headline={[[{ text: '못 먹는 음식', mark: true }, { text: '이' }], [{ text: '있나요?' }]]}
    >
      {/* renewal B (11/27): the foods in the black card, four to a row under "none"; the rest in a white card */}
      <AskCard>
        <AskRow answered={noneChosen || selectedAllergens.length > 0} first hint="여러 개 고를 수 있어요" title="알레르기">
          <AskChip
            label="없어요"
            many
            onPress={() => {
              setNoneChosen(true);
              setSelectedAllergens([]);
            }}
            selected={noneChosen && selectedAllergens.length === 0}
          />
          <View style={styles.allergenGrid}>
            {allergenOptions.map((option) => (
              <AskChip
                key={option.id}
                label={option.label}
                many
                onPress={() => toggleAllergen(option.id)}
                selected={selectedAllergens.includes(option.id)}
                style={styles.allergenButton}
              />
            ))}
          </View>
        </AskRow>
      </AskCard>
      <View style={styles.card}>
        <Text style={styles.otherTitle}>그 밖의 알레르기<Text style={styles.optional}>  선택</Text></Text>
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
        <Text style={styles.noticeText}>참고용 정보예요. 음식을 먹기 전에는 성분표를 꼭 확인해 주세요.</Text>
      </View>
    </SignUpScreenLayout>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    // Four in a row; "none" is a row of its own, so the twelve below it make three full rows.
    allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    allergenButton: { flexBasis: '23%', flexGrow: 1 },
    card: { ...a.card, gap: 10, paddingBottom: 20, paddingHorizontal: 22, paddingTop: 18 },
    otherTitle: { ...a.q, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20, marginBottom: 0 },
    otherInput: { ...a.field, ...a.input },
    optional: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    noticeText: a.note,
  } as const;
}
