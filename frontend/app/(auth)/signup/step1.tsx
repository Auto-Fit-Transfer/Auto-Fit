import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import CalendarIcon from '@/assets/icons/input/Calendar.svg';
import CheckIcon from '@/assets/icons/auth-redesign/ab4c2.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import { getSignupApiErrorMessage, saveProfile } from '@/src/api/onboarding';
import { AuthButton, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { BirthDatePicker, SignUpScreenLayout } from '@/src/components/auth';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { useSignup, type SignupGender } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

const consentItems = [
  { key: 'age', label: '만 14세 이상이에요', required: true },
  { key: 'service', label: '서비스 이용약관', required: true },
  { key: 'privacy', label: '개인정보 수집 · 이용', required: true },
  {
    key: 'health',
    label: '건강정보(민감정보) 수집 · 이용',
    detail: '검진 결과 · 체성분 · 알레르기 · 운동 기록을 맞춤 추천에 써요',
    required: true,
  },
  { key: 'marketing', label: '혜택 · 이벤트 알림 받기', required: false },
] as const;
type ConsentKey = (typeof consentItems)[number]['key'];
const formatDate = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export default function SignUpStep1Screen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLogin = flow === 'post-login';
  const { draft, updateDraft } = useSignup();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const inFlight = useRef(false);
  const [name, setName] = useState(draft.name);
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [birthday, setBirthday] = useState<Date | undefined>(
    draft.birthDate ? new Date(draft.birthDate + 'T00:00:00') : undefined,
  );
  const [birthdayPickerVisible, setBirthdayPickerVisible] = useState(false);
  const [gender, setGender] = useState<SignupGender | undefined>(draft.gender);
  const [consentVisible, setConsentVisible] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);
  const [consents, setConsents] = useState<ConsentKey[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const allChecked = consents.length === consentItems.length;
  const requiredChecked = consentItems.every(
    (item) => !item.required || consents.includes(item.key),
  );

  const validationMessage = () => {
    if (!name.trim()) return '이름을 입력해 주세요.';
    if (!isPostLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return '올바른 이메일을 입력해 주세요.';
    if (
      !isPostLogin &&
      !(
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
      )
    )
      return '비밀번호는 8자 이상이며 영문 대소문자, 숫자, 특수문자를 포함해야 합니다.';
    if (!birthday) return '생년월일을 선택해 주세요.';
    const ageLimit = new Date();
    ageLimit.setFullYear(ageLimit.getFullYear() - 14);
    if (birthday > ageLimit) return '만 14세 이상부터 가입할 수 있어요.';
    if (!gender) return '성별을 선택해 주세요.';
    return undefined;
  };

  const continueFromForm = async () => {
    const message = validationMessage();
    if (message) return Alert.alert('입력 정보를 확인해 주세요', message);
    if (!isPostLogin) return setConsentVisible(true);
    if (inFlight.current || !birthday || !gender) return;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      const birthDate = formatDate(birthday);
      await saveProfile({ name: name.trim(), birthDate, gender });
      updateDraft({ name: name.trim(), birthDate, gender });
      router.push({ pathname: '/signup/step3', params: { flow: 'post-login' } });
    } catch (error) {
      Alert.alert('프로필 정보를 저장하지 못했습니다', getSignupApiErrorMessage(error));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const startSignup = async () => {
    if (inFlight.current || !birthday || !gender || !requiredChecked) return;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      if (data.user && data.user.identities?.length === 0)
        throw new Error('이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.');
      updateDraft({
        email: normalizedEmail,
        name: name.trim(),
        birthDate: formatDate(birthday),
        gender,
      });
      setConsentVisible(false);
      router.push(
        data.session
          ? '/signup/step3'
          : { pathname: '/signup/step2', params: { email: normalizedEmail } },
      );
    } catch (error) {
      Alert.alert(
        '회원가입을 시작하지 못했습니다',
        getSignupAuthErrorMessage(error, '잠시 후 다시 시도해 주세요.'),
      );
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const toggleConsent = (key: ConsentKey) =>
    setConsents((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  return (
    <SignUpScreenLayout
      ctaLabel="다음"
      ctaLoading={isSubmitting}
      currentStep={1}
      totalSteps={isPostLogin ? 4 : 5}
      onBack={() => (isPostLogin ? router.back() : setExitVisible(true))}
      onContinue={() => void continueFromForm()}
    >
      <View style={styles.form}>
        <AuthTextField
          accessibilityLabel="이름"
          autoComplete="name"
          label="이름"
          onChangeText={setName}
          onSubmitEditing={() => emailRef.current?.focus()}
          placeholder="이름을 입력해 주세요"
          returnKeyType={isPostLogin ? 'done' : 'next'}
          value={name}
        />
        {!isPostLogin ? (
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
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="이메일을 입력해 주세요"
              returnKeyType="next"
              value={email}
            />
            <AuthTextField
              ref={passwordRef}
              accessibilityLabel="비밀번호"
              autoCapitalize="none"
              autoComplete="new-password"
              label="비밀번호"
              onChangeText={setPassword}
              placeholder="비밀번호를 입력해 주세요"
              secureTextEntry={!passwordVisible}
              rightElement={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                  onPress={() => setPasswordVisible((current) => !current)}
                >
                  {passwordVisible ? <EyeSlashIcon height={22} width={22} /> : <EyeIcon height={22} width={22} />}
                </Pressable>
              }
              value={password}
            />
            <Text style={styles.hint}>
              8자 이상, 영문 대소문자 · 숫자 · 특수문자를 섞어 주세요
            </Text>
          </>
        ) : null}
        <View>
          <Text style={styles.label}>생년월일</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="생년월일 선택"
            onPress={() => setBirthdayPickerVisible(true)}
            style={styles.select}
          >
            <Text style={[styles.selectText, !birthday && styles.placeholder]}>
              {birthday ? formatDate(birthday).replace(/-/g, '. ') : '생년월일을 선택해 주세요'}
            </Text>
            <CalendarIcon height={22} width={22} />
          </Pressable>
        </View>
        <View>
          <Text style={styles.label}>성별</Text>
          <View style={styles.genderRow}>
            {(
              [
                ['male', '남성'],
                ['female', '여성'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: gender === value }}
                onPress={() => setGender(value)}
                style={[styles.gender, gender === value && styles.genderSelected]}
              >
                <Text style={[styles.genderText, gender === value && styles.genderTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            ))}
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
        value={birthday ?? new Date()}
        visible={birthdayPickerVisible}
      />
      <ConfirmDialog
        visible={exitVisible}
        title="가입을 그만둘까요?"
        description="지금까지 입력한 내용은 저장되지 않아요."
        secondaryLabel="그만두기"
        primaryLabel="계속 가입하기"
        onSecondary={() => {
          setExitVisible(false);
          router.replace('/login');
        }}
        onPrimary={() => setExitVisible(false)}
      />
      <Modal
        animationType="slide"
        transparent
        visible={consentVisible}
        onRequestClose={() => setConsentVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="약관 동의 닫기"
            onPress={() => setConsentVisible(false)}
            style={styles.scrim}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>약관에 동의해 주세요</Text>
            <Text style={styles.sheetDescription}>
              필수 항목에 동의하면 회원가입을 진행할 수 있어요.
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allChecked }}
              onPress={() => setConsents(allChecked ? [] : consentItems.map((item) => item.key))}
              style={styles.allRow}
            >
              <View style={[styles.checkbox, allChecked && styles.checkboxOn]}>
                {allChecked ? <CheckIcon height={16} width={16} /> : null}
              </View>
              <View style={styles.consentCopy}>
                <Text style={styles.allText}>모두 동의하기</Text>
                <Text style={styles.allHint}>선택 항목도 함께 동의해요</Text>
              </View>
            </Pressable>
            {consentItems.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consents.includes(item.key) }}
                onPress={() => toggleConsent(item.key)}
                style={styles.consentRow}
              >
                <View style={[styles.checkbox, consents.includes(item.key) && styles.checkboxOn]}>
                  {consents.includes(item.key) ? <CheckIcon height={16} width={16} /> : null}
                </View>
                <View style={styles.consentCopy}>
                  <Text style={styles.consentText}>
                    <Text style={styles.required}>{item.required ? '필수  ' : '선택  '}</Text>
                    {item.label}
                  </Text>
                  {'detail' in item ? <Text style={styles.consentDetail}>{item.detail}</Text> : null}
                </View>
              </Pressable>
            ))}
            <AuthButton
              disabled={!requiredChecked}
              loading={isSubmitting}
              onPress={() => void startSignup()}
              title="동의하고 계속하기"
            />
          </View>
        </View>
      </Modal>
    </SignUpScreenLayout>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    form: { gap: 20 },
    hint: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: -12,
    },
    label: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 8,
    },
    select: {
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
    selectText: { color: colors.textPrimary, fontSize: 16 },
    placeholder: { color: colors.textSecondary },
    genderRow: { flexDirection: 'row', gap: 8 },
    gender: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flex: 1,
      height: 40,
      justifyContent: 'center',
    },
    genderSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    genderText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    genderTextSelected: { color: '#FFFFFF' },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(13, 13, 20, 0.45)' },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      gap: 16,
      paddingBottom: 34,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    handle: {
      alignSelf: 'center',
      backgroundColor: colors.border,
      borderRadius: 3,
      height: 4,
      width: 40,
    },
    sheetTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26, marginTop: 4 },
    sheetDescription: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: -10 },
    allRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    consentCopy: { flex: 1, gap: 2 },
    allText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    allHint: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    consentRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, minHeight: 24 },
    consentText: { color: colors.textPrimary, fontSize: 14, lineHeight: 24 },
    consentDetail: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    required: { fontFamily: fontFamilies.pretendardBold },
    checkbox: {
      alignItems: 'center',
      borderColor: colors.textDisabled,
      borderRadius: 8,
      borderWidth: 1,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  } as const;
}
