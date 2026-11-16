import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import CheckIcon from '@/assets/icons/system/Check.svg';
import { getSignupApiErrorMessage, saveProfile } from '@/src/api/onboarding';
import { aForm } from '@/src/components/a/form';
import { WHO_KEY, type Who } from '@/src/components/a/sprites';
import { AuthButton, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { BirthDatePicker, SignUpScreenLayout } from '@/src/components/auth';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { useSignup, type SignupGender } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';
const consentItems = [
  { key: 'age', label: '만 14세 이상이에요', required: true },
  { key: 'service', label: '서비스 이용약관', required: true },
  { key: 'privacy', label: '개인정보 수집 · 이용', required: true },
  {
    key: 'health',
    label: '건강정보(민감정보) 수집 · 이용',
    detail: '검진 결과 · 체성분 · 알레르기 · 운동 기록을 추천에 써요',
    required: true,
  },
  { key: 'marketing', label: '혜택 · 이벤트 알림 받기', required: false },
] as const;
type ConsentKey = (typeof consentItems)[number]['key'];
type Job = 'worker' | 'student';
const formatDate = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

// Renewal A: joining is making my character. Signing up with a mail address asks in two parts on this
// screen, the account and then the character (job, sex, birthday); after a social login there is no
// account to make, so it is one part. The job is new and only picks the character, kept on this phone.
export default function SignUpStep1Screen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPostLogin = flow === 'post-login';
  const { draft, updateDraft } = useSignup();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const inFlight = useRef(false);
  const leftToVerify = useRef(false);
  const [part, setPart] = useState<0 | 1>(0);
  const [name, setName] = useState(draft.name);
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [birthday, setBirthday] = useState<Date | undefined>(
    draft.birthDate ? new Date(draft.birthDate + 'T00:00:00') : undefined,
  );
  const [birthdayPickerVisible, setBirthdayPickerVisible] = useState(false);
  const [job, setJob] = useState<Job>('worker');
  const [gender, setGender] = useState<SignupGender | undefined>(draft.gender);
  const [consentVisible, setConsentVisible] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);
  const [consents, setConsents] = useState<ConsentKey[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const allChecked = consents.length === consentItems.length;
  const requiredChecked = consentItems.every(
    (item) => !item.required || consents.includes(item.key),
  );
  const showAccount = isPostLogin || part === 0;
  const showCharacter = isPostLogin || part === 1;
  const who: Who = `${job}-${gender === 'male' ? 'm' : 'f'}`;

  useFocusEffect(
    useCallback(() => {
      // Back from the mail code step (to change the address, say): the account part opens again.
      if (leftToVerify.current) {
        leftToVerify.current = false;
        setPart(0);
      }
      if (part !== 1) return undefined;
      // Android's own back button goes back one part first, as the button on the screen does.
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setPart(0);
        return true;
      });
      return () => subscription.remove();
    }, [part]),
  );

  const accountMessage = () => {
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
    return undefined;
  };
  const characterMessage = () => {
    if (!birthday) return '생년월일을 선택해 주세요.';
    const ageLimit = new Date();
    ageLimit.setFullYear(ageLimit.getFullYear() - 14);
    if (birthday > ageLimit) return '만 14세 이상부터 가입할 수 있어요.';
    if (!gender) return '성별을 선택해 주세요.';
    return undefined;
  };

  const continueFromForm = async () => {
    const message =
      (showAccount ? accountMessage() : undefined) ?? (showCharacter ? characterMessage() : undefined);
    if (message) return Alert.alert('입력 정보를 확인해 주세요', message);
    if (!showCharacter) return setPart(1);
    // The character made here is the one that walks on the home screen.
    void AsyncStorage.setItem(WHO_KEY, who).catch(() => undefined);
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
      leftToVerify.current = !data.session;
      router.push(data.session ? '/signup/step3' : '/signup/step2');
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
      onBack={() => (part === 1 ? setPart(0) : isPostLogin ? router.back() : setExitVisible(true))}
      onContinue={() => void continueFromForm()}
      pair={showCharacter}
      secondPart={part === 1}
      who={who}
    >
      <View style={styles.form}>
        {showAccount ? (
          <AuthTextField
            accessibilityLabel="이름"
            autoComplete="name"
            onChangeText={setName}
            onSubmitEditing={() => emailRef.current?.focus()}
            placeholder="이름"
            returnKeyType={isPostLogin ? 'done' : 'next'}
            value={name}
          />
        ) : null}
        {showAccount && !isPostLogin ? (
          <>
            <AuthTextField
              ref={emailRef}
              accessibilityLabel="이메일"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="이메일"
              returnKeyType="next"
              value={email}
            />
            <AuthTextField
              ref={passwordRef}
              accessibilityLabel="비밀번호"
              autoCapitalize="none"
              autoComplete="new-password"
              fieldStyle={styles.withMini}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry={!passwordVisible}
              rightElement={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                  hitSlop={8}
                  onPress={() => setPasswordVisible((current) => !current)}
                  style={styles.mini}
                >
                  <Text style={styles.miniText}>{passwordVisible ? '숨기기' : '보기'}</Text>
                </Pressable>
              }
              value={password}
            />
            <Text style={styles.hint}>8자 이상, 영문 대소문자 · 숫자 · 특수문자를 섞어 주세요</Text>
          </>
        ) : null}
        {showCharacter ? (
          <>
            <View style={isPostLogin && styles.ask}>
              <Text style={styles.q}>직업</Text>
              <View style={styles.segRow}>
                {(
                  [
                    ['worker', '직장인'],
                    ['student', '학생'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: job === value }}
                    onPress={() => setJob(value)}
                    style={[styles.seg, job === value && styles.segOn]}
                  >
                    <Text style={[styles.segText, job === value && styles.onText]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ask}>
              <Text style={styles.q}>성별</Text>
              <View style={styles.segRow}>
                {(
                  [
                    ['female', '여성'],
                    ['male', '남성'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: gender === value }}
                    onPress={() => setGender(value)}
                    style={[styles.seg, gender === value && styles.segOn]}
                  >
                    <Text style={[styles.segText, gender === value && styles.onText]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ask}>
              <Text style={styles.q}>생년월일</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="생년월일 선택"
                onPress={() => setBirthdayPickerVisible(true)}
                style={styles.select}
              >
                <Text style={[styles.selectText, !birthday && styles.placeholder]}>
                  {birthday ? formatDate(birthday).replace(/-/g, '. ') : '생년월일을 선택해 주세요'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
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
        primaryLabel="계속 만들기"
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
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              약관에 동의해 주세요
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allChecked }}
              onPress={() => setConsents(allChecked ? [] : consentItems.map((item) => item.key))}
              style={styles.allRow}
            >
              <View style={[styles.tick, allChecked && styles.on]}>
                {allChecked ? <CheckIcon color={colors.onPrimary} height={18} width={18} /> : null}
              </View>
              <View style={styles.consentCopy}>
                <Text style={styles.consentText}>모두 동의하기</Text>
                <Text style={styles.note}>선택 항목도 함께 동의해요</Text>
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
                <View style={[styles.tick, consents.includes(item.key) && styles.on]}>
                  {consents.includes(item.key) ? (
                    <CheckIcon color={colors.onPrimary} height={18} width={18} />
                  ) : null}
                </View>
                <View style={styles.consentCopy}>
                  <Text style={styles.consentText}>
                    {item.required ? '필수' : '선택'} · {item.label}
                  </Text>
                  {'detail' in item ? <Text style={styles.note}>{item.detail}</Text> : null}
                </View>
              </Pressable>
            ))}
            <View style={styles.sheetGo}>
              <AuthButton
                disabled={!requiredChecked}
                loading={isSubmitting}
                onPress={() => void startSignup()}
                title="동의하고 계속하기"
              />
            </View>
          </View>
        </View>
      </Modal>
    </SignUpScreenLayout>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    form: { gap: 8 },
    ask: { marginTop: 6 },
    q: a.q,
    note: a.note,
    hint: { ...a.note, marginHorizontal: 2 },
    // The row is 4 taller than its buttons: the ledge they stand on.
    segRow: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
    seg: a.seg,
    segOn: a.segOn,
    segText: a.segText,
    on: a.on,
    onText: a.onText,
    select: a.field,
    selectText: a.input,
    placeholder: { color: colors.textSecondary },
    // The small button sits 6 from the field's edge, as far as it is from its top and bottom.
    withMini: { paddingRight: 6 },
    mini: a.mini,
    miniText: a.miniText,
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22, 24, 46, 0.45)' },
    sheet: {
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderBottomWidth: 0,
      borderColor: colors.ink,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 2,
      maxWidth: 480,
      paddingBottom: 34,
      paddingHorizontal: 16,
      paddingTop: 18,
      width: '100%',
    },
    sheetTitle: {
      color: colors.ink,
      fontFamily: fontFamilies.galmuri11Bold,
      fontSize: 24,
      lineHeight: 28,
      marginBottom: 6,
      marginHorizontal: 4,
    },
    allRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 54 },
    consentRow: {
      alignItems: 'center',
      borderTopColor: colors.track,
      borderTopWidth: 2,
      flexDirection: 'row',
      gap: 10,
      minHeight: 46,
      paddingVertical: 6,
    },
    consentCopy: { flex: 1, gap: 2 },
    consentText: { ...a.p15, color: colors.ink },
    tick: a.tick,
    sheetGo: { marginTop: 16 },
  } as const;
}
