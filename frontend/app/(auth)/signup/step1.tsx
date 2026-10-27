import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Dimensions,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import DownIcon from '@/assets/icons/auth-redesign/27cb4.svg';
import BirthChevronIcon from '@/assets/icons/auth-redesign/167c7.svg';
import CalendarIcon from '@/assets/icons/auth-redesign/dc269.svg';
import EmailIcon from '@/assets/icons/auth-redesign/1790c.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import EyeCloseIcon from '@/assets/icons/auth-redesign/5facc.svg';
import PasswordIcon from '@/assets/icons/auth-redesign/6a5e9.svg';
import UserIcon from '@/assets/icons/auth-redesign/5df69.svg';
import CheckIcon from '@/assets/icons/auth-redesign/ab4c2.svg';
import { BirthDatePicker, SignUpScreenLayout, SignUpSection } from '@/src/components/auth';
import { IconButton, SelectField, Text } from '@/src/components/common';
import { AuthTextField } from '@/src/components/auth/AuthRedesign';
import { getSignupApiErrorMessage, saveProfile } from '@/src/api/onboarding';
import { useSignup, type SignupGender } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { colors, fontFamilies, typography } from '@/src/theme';

type Gender = SignupGender;
type Step1InputKey = 'email' | 'password' | 'confirm-password' | 'name';

const minimumScreenHeight = 740;
const maximumScreenHeight = 917;
const signUpBrandVisualHeight = 144;
const defaultBirthday = new Date();
const keyboardSafeGap = 20;

function formatBirthday(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
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

function getValidationMessage({
  email,
  password,
  confirmPassword,
  name,
  birthday,
  gender,
  agreed,
}: {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  birthday?: Date;
  gender?: Gender;
  agreed: boolean;
}) {
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
    return '비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.';
  }
  if (password !== confirmPassword) return '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
  if (!birthday) return '생년월일을 선택해 주세요.';
  if (!name.trim()) return '이름을 입력해 주세요.';
  if (!gender) return '성별을 선택해 주세요.';
  if (!agreed) return '회원가입을 위해 약관에 동의해 주세요.';
  return undefined;
}

export default function SignUpStep1Screen() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { draft, updateDraft } = useSignup();
  const isPostLoginOnboarding = flow === 'post-login';
  const { height: windowHeight } = useWindowDimensions();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const submitInFlightRef = useRef(false);
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState(draft.name);
  const [birthday, setBirthday] = useState<Date | undefined>(() => parseBirthDate(draft.birthDate));
  const [birthdayPickerVisible, setBirthdayPickerVisible] = useState(false);
  const [gender, setGender] = useState<Gender | undefined>(() =>
    isPostLoginOnboarding ? undefined : draft.gender,
  );
  const [agreed, setAgreed] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [focusedInputKey, setFocusedInputKey] = useState<Step1InputKey | null>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const signUpBrandBottom = verticalValue(96, 74) + signUpBrandVisualHeight;
  const formTop = Math.max(verticalValue(287, 230), signUpBrandBottom + 12);

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

  const goNext = async () => {
    if (submitInFlightRef.current) return;

    const validationMessage = isPostLoginOnboarding
      ? !birthday
        ? '생년월일을 선택해 주세요.'
        : !gender
          ? '성별을 선택해 주세요.'
          : !name.trim()
            ? '이름을 입력해 주세요.'
            : undefined
      : getValidationMessage({
          email,
          password,
          confirmPassword,
          name,
          birthday,
          gender,
          agreed,
        });
    if (validationMessage) {
      Alert.alert('입력 정보를 확인해 주세요', validationMessage);
      return;
    }

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
      console.log('회원가입 요청 확인', {
        rawEmail: email,
        normalizedEmail,
        emailLength: normalizedEmail.length,
      });

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

  const openBirthdayPicker = () => {
    setBirthdayPickerVisible(true);
  };

  return (
    <SignUpScreenLayout
      alignStepCta
      ctaLabel="다음"
      ctaLoading={isSubmitting}
      contentOffsetY={keyboardContentOffset}
      currentStep={1}
      totalSteps={isPostLoginOnboarding ? 3 : 4}
      onBack={goBack}
      onContinue={goNext}
    >
      <SignUpSection innerStyle={styles.form} top={formTop}>
        {!isPostLoginOnboarding ? (
          <>
            <AuthTextField
              ref={emailRef}
              accessibilityLabel="이메일"
              label="이메일"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              leftElement={
                <FieldIcon
                  icon={<EmailIcon color={colors.textNavigator} height={20} width={20} />}
                />
              }
              onChangeText={setEmail}
              onFocus={() => handleInputFocus('email', emailRef.current)}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="이메일을 입력해 주세요"
              returnKeyType="next"
              style={styles.textFieldInput}
              textContentType="emailAddress"
              value={email}
            />
            <AuthTextField
              ref={passwordRef}
              accessibilityLabel="비밀번호"
              label="비밀번호"
              autoCapitalize="none"
              autoComplete="new-password"
              leftElement={
                <FieldIcon
                  icon={<PasswordIcon color={colors.textNavigator} height={20} width={20} />}
                />
              }
              onChangeText={setPassword}
              onFocus={() => handleInputFocus('password', passwordRef.current)}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              placeholder="비밀번호를 입력해 주세요"
              returnKeyType="next"
              rightElement={
                <PasswordVisibilityButton
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  visible={passwordVisible}
                />
              }
              secureTextEntry={!passwordVisible}
              style={styles.textFieldInput}
              textContentType="newPassword"
              value={password}
            />
            <AuthTextField
              ref={confirmPasswordRef}
              accessibilityLabel="비밀번호 확인"
              label="비밀번호 확인"
              autoCapitalize="none"
              autoComplete="new-password"
              leftElement={
                <FieldIcon
                  icon={<PasswordIcon color={colors.textNavigator} height={20} width={20} />}
                />
              }
              onChangeText={setConfirmPassword}
              onFocus={() => handleInputFocus('confirm-password', confirmPasswordRef.current)}
              onSubmitEditing={() => nameRef.current?.focus()}
              placeholder="비밀번호를 다시 입력해 주세요"
              returnKeyType="next"
              rightElement={
                <PasswordVisibilityButton
                  onPress={() => setConfirmPasswordVisible((visible) => !visible)}
                  visible={confirmPasswordVisible}
                />
              }
              secureTextEntry={!confirmPasswordVisible}
              style={styles.textFieldInput}
              textContentType="newPassword"
              value={confirmPassword}
            />
          </>
        ) : null}
        <SelectField
          accessibilityLabel="생년월일 선택"
          fieldStyle={styles.selectField}
          leftElement={
            <FieldIcon
              icon={<CalendarIcon color={colors.textNavigator} height={20} width={20} />}
            />
          }
          onPress={openBirthdayPicker}
          label="생년월일"
          labelStyle={styles.fieldLabel}
          placeholder="생년월일을 선택해 주세요"
          placeholderTextColor={colors.textNavigator}
          valueStyle={styles.selectFieldText}
          rightElement={<BirthChevronIcon height={20} width={20} />}
          value={birthday ? formatBirthday(birthday) : undefined}
        />
        <AuthTextField
          ref={nameRef}
          accessibilityLabel="이름"
          label="이름"
          autoComplete="name"
          leftElement={
            <FieldIcon icon={<UserIcon color={colors.textNavigator} height={20} width={20} />} />
          }
          onChangeText={setName}
          onFocus={() => handleInputFocus('name', nameRef.current)}
          placeholder="이름을 입력해 주세요"
          returnKeyType="done"
          style={styles.textFieldInput}
          textContentType="name"
          value={name}
        />
        <View style={styles.genderField}>
          <Text style={styles.genderLabel}>성별</Text>
          <View style={styles.genderActions}>
            <GenderButton
              label="남성"
              onPress={() => setGender('male')}
              selected={gender === 'male'}
            />
            <GenderButton
              label="여성"
              onPress={() => setGender('female')}
              selected={gender === 'female'}
            />
          </View>
        </View>
      </SignUpSection>
      {!isPostLoginOnboarding ? (
        <SignUpSection card={false} top={0}>
          <Pressable
            accessibilityLabel="모든 약관 동의"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed((value) => !value)}
            style={({ pressed }) => [styles.termsField, pressed && styles.pressed]}
          >
            <View style={styles.termsLeft}>
              <View style={[styles.checkbox, agreed && styles.checkboxSelected]}>
                {agreed ? <CheckIcon color={colors.primaryDark} height={14} width={14} /> : null}
              </View>
              <Text style={styles.termsText}>모든 약관에 동의합니다</Text>
            </View>
            <DownIcon color={colors.textSecondary} height={20} width={20} />
          </Pressable>
        </SignUpSection>
      ) : null}
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
    </SignUpScreenLayout>
  );
}

function FieldIcon({ icon }: { icon: React.ReactNode }) {
  return <View style={styles.fieldIcon}>{icon}</View>;
}

function PasswordVisibilityButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  return (
    <IconButton
      accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
      icon={
        visible ? (
          <EyeIcon color={colors.textNavigator} height={20} width={20} />
        ) : (
          <EyeCloseIcon color={colors.textNavigator} height={20} width={20} />
        )
      }
      onPress={onPress}
      size={44}
      style={styles.eyeButton}
    />
  );
}

interface GenderButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function GenderButton({ label, selected, onPress }: GenderButtonProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.genderButton,
        selected && styles.genderButtonSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.genderButtonText, selected && styles.genderButtonTextSelected]}>
        {label}
      </Text>
      <View style={[styles.genderRadio, selected && styles.genderRadioSelected]}>
        {selected ? <CheckIcon height={14} width={14} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  textFieldInput: { fontSize: 15, lineHeight: 23 },
  fieldIcon: { alignItems: 'center', height: 20, justifyContent: 'center', width: 20 },
  eyeButton: { marginRight: -11 },
  selectField: {
    backgroundColor: colors.background,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
  },
  selectFieldText: { fontSize: 15, lineHeight: 23 },
  fieldLabel: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
  genderField: { gap: 6 },
  genderLabel: {
    color: colors.dark,
    fontFamily: typography.sectionTitle.fontFamily,
    fontSize: 15,
    lineHeight: 22,
  },
  genderActions: { flexDirection: 'row', gap: 8 },
  genderButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 48,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  genderButtonSelected: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
  genderButtonText: {
    color: colors.dark,
    fontFamily: typography.sectionTitle.fontFamily,
    fontSize: 15,
  },
  genderButtonTextSelected: { color: colors.primaryDark },
  genderRadio: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    width: 20,
  },
  genderRadioSelected: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  termsField: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  termsLeft: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  checkbox: {
    borderColor: colors.textSecondary,
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    width: 20,
  },
  checkboxSelected: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  termsText: { color: colors.dark, fontFamily: typography.sectionTitle.fontFamily, fontSize: 15 },
  pressed: { opacity: 0.75 },
});
