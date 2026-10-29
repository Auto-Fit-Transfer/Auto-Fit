import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Keyboard, Platform, Pressable, TextInput, View } from 'react-native';

import EyeCloseIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import CalendarIcon from '@/assets/icons/ui/calendar-check.svg';
import { BirthDatePicker, SignUpScreenLayout, TermsSheet } from '@/src/components/auth';
import { AuthTextField } from '@/src/components/auth/AuthRedesign';
import { Chip, SelectField, Text } from '@/src/components/common';
import { getSignupApiErrorMessage, saveProfile } from '@/src/api/onboarding';
import { useSignup, type SignupGender } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type Gender = SignupGender;
type Step1InputKey = 'name' | 'email' | 'password';

const defaultBirthday = new Date();
const keyboardSafeGap = 20;

function formatBirthday(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}. ${month}. ${day}`;
}

function formatBirthDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseBirthDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

// Same rule as the Supabase setting: 8+ characters with lower and upper case, a digit and a symbol.
function getValidationMessage({
  name,
  email,
  password,
  birthday,
  gender,
  needsAccount,
}: {
  name: string;
  email: string;
  password: string;
  birthday?: Date;
  gender?: Gender;
  needsAccount: boolean;
}) {
  if (!name.trim()) return '이름을 입력해 주세요.';
  if (needsAccount) {
    if (!email.trim()) return '이메일을 입력해 주세요.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return '올바른 이메일 형식을 입력해 주세요.';
    if (!password) return '비밀번호를 입력해 주세요.';
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return '비밀번호는 8자 이상이며 영문 대문자 · 소문자, 숫자, 특수문자를 모두 넣어 주세요.';
    }
  }
  if (!birthday) return '생년월일을 골라 주세요.';
  if (!gender) return '성별을 골라 주세요.';
  return undefined;
}

// Figma A3, with the A4 terms sheet before the account is made.
export default function SignUpStep1Screen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { draft, updateDraft } = useSignup();
  const isPostLoginOnboarding = flow === 'post-login';
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const submitInFlightRef = useRef(false);
  const [name, setName] = useState(draft.name);
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState<Date | undefined>(() => parseBirthDate(draft.birthDate));
  const [birthdayPickerVisible, setBirthdayPickerVisible] = useState(false);
  const [gender, setGender] = useState<Gender | undefined>(() =>
    isPostLoginOnboarding ? undefined : draft.gender,
  );
  const [agreed, setAgreed] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedInputKey, setFocusedInputKey] = useState<Step1InputKey | null>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (Platform.OS !== 'android' || focusedInputKey === null || keyboardTop === null) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      focusedInputRef.current?.measureInWindow((_x, y, _width, height) => {
        const hiddenAmount = y + height - (keyboardTop - keyboardSafeGap);
        setKeyboardContentOffset(Math.max(0, hiddenAmount));
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [focusedInputKey, keyboardTop]);

  const handleInputFocus = (key: Step1InputKey, input: TextInput | null) => {
    focusedInputRef.current = input;
    setFocusedInputKey(key);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  const submit = async () => {
    if (submitInFlightRef.current) return;

    const birthDate = formatBirthDateForApi(birthday!);
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    Keyboard.dismiss();

    try {
      if (isPostLoginOnboarding) {
        const profileName = name.trim();
        await saveProfile({ name: profileName, birthDate, gender: gender! });
        updateDraft({ name: profileName, birthDate, gender: gender! });
        router.push({ pathname: '/signup/step3', params: { flow: 'post-login' } });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      if (data.user && data.user.identities?.length === 0) {
        throw new Error('이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.');
      }

      updateDraft({ email: normalizedEmail, name: name.trim(), birthDate, gender });

      if (data.session) {
        router.push('/signup/step3');
      } else {
        router.push({ pathname: '/signup/step2', params: { email: normalizedEmail } });
      }
    } catch (error) {
      if (isPostLoginOnboarding) {
        console.error('소셜 로그인 프로필 저장 실패:', error);
        Alert.alert('프로필 정보를 저장하지 못했습니다', getSignupApiErrorMessage(error));
      } else {
        console.error('회원가입 시작 실패:', error);
        Alert.alert(
          '회원가입을 시작하지 못했습니다',
          getSignupAuthErrorMessage(error, '잠시 후 다시 시도해 주세요.'),
        );
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const goNext = () => {
    const validationMessage = getValidationMessage({
      name,
      email,
      password,
      birthday,
      gender,
      needsAccount: !isPostLoginOnboarding,
    });
    if (validationMessage) {
      Alert.alert('입력 정보를 확인해 주세요', validationMessage);
      return;
    }
    if (!isPostLoginOnboarding && !agreed) {
      Keyboard.dismiss();
      setTermsVisible(true);
      return;
    }
    void submit();
  };

  return (
    <SignUpScreenLayout
      ctaLabel="다음"
      ctaLoading={isSubmitting}
      contentOffsetY={keyboardContentOffset}
      currentStep={1}
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={goBack}
      onContinue={goNext}
    >
      <View style={styles.form}>
        <AuthTextField
          ref={nameRef}
          accessibilityLabel="이름"
          autoComplete="name"
          label="이름"
          onChangeText={setName}
          onFocus={() => handleInputFocus('name', nameRef.current)}
          onSubmitEditing={() =>
            isPostLoginOnboarding ? Keyboard.dismiss() : emailRef.current?.focus()
          }
          placeholder="이름을 입력해 주세요"
          returnKeyType={isPostLoginOnboarding ? 'done' : 'next'}
          textContentType="name"
          value={name}
        />
        {!isPostLoginOnboarding ? (
          <>
            <AuthTextField
              ref={emailRef}
              accessibilityLabel="이메일"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              label="이메일"
              onChangeText={setEmail}
              onFocus={() => handleInputFocus('email', emailRef.current)}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="example@email.com"
              returnKeyType="next"
              textContentType="emailAddress"
              value={email}
            />
            <AuthTextField
              ref={passwordRef}
              accessibilityLabel="비밀번호"
              autoCapitalize="none"
              autoComplete="new-password"
              helperText="8자 이상, 영문 대문자 · 소문자 · 숫자 · 특수문자를 섞어 주세요"
              label="비밀번호"
              onChangeText={setPassword}
              onFocus={() => handleInputFocus('password', passwordRef.current)}
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="비밀번호를 입력해 주세요"
              returnKeyType="done"
              rightElement={
                <Pressable
                  accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <EyeIcon height={20} width={20} />
                  ) : (
                    <EyeCloseIcon height={20} width={20} />
                  )}
                </Pressable>
              }
              secureTextEntry={!passwordVisible}
              textContentType="newPassword"
              value={password}
            />
          </>
        ) : null}
        <SelectField
          accessibilityLabel="생년월일 고르기"
          label="생년월일"
          onPress={() => {
            Keyboard.dismiss();
            setBirthdayPickerVisible(true);
          }}
          placeholder="생년월일을 골라 주세요"
          rightElement={<CalendarIcon color={colors.textSecondary} height={22} width={22} />}
          value={birthday ? formatBirthday(birthday) : undefined}
        />
        <View>
          <Text style={styles.label}>성별</Text>
          <View accessibilityRole="radiogroup" style={styles.genderRow}>
            <Chip
              label="남성"
              onPress={() => setGender('male')}
              selected={gender === 'male'}
              style={styles.genderChip}
            />
            <Chip
              label="여성"
              onPress={() => setGender('female')}
              selected={gender === 'female'}
              style={styles.genderChip}
            />
          </View>
        </View>
      </View>
      <BirthDatePicker
        maximumDate={new Date()}
        onCancel={() => setBirthdayPickerVisible(false)}
        onConfirm={(date) => {
          setBirthday(date);
          setBirthdayPickerVisible(false);
        }}
        value={birthday ?? defaultBirthday}
        visible={birthdayPickerVisible}
      />
      <TermsSheet
        onAgree={() => {
          setAgreed(true);
          setTermsVisible(false);
          void submit();
        }}
        onClose={() => setTermsVisible(false)}
        visible={termsVisible}
      />
    </SignUpScreenLayout>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    form: { gap: 20 },
    label: { ...text.body2Strong, color: colors.textPrimary, marginBottom: 8 },
    genderRow: { flexDirection: 'row', gap: 8 },
    genderChip: { flex: 1, minHeight: 48 },
  } as const;
}
