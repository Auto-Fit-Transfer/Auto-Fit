import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import EmailIcon from '@/assets/icons/input/Email.svg';
import { SignUpScreenLayout, SignUpSection } from '@/src/components/auth';
import { useSignup } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { colors, fontFamilies, radius, typography } from '@/src/theme';

const verificationCodeLength = 6;
const minimumScreenHeight = 740;
const maximumScreenHeight = 917;
const signUpBrandVisualHeight = 144;
const sectionGap = 20;
const confirmContentHeight = 254;

export default function SignUpStep2Screen() {
  const router = useRouter();
  const { draft } = useSignup();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : draft.email;
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const verifyInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);
  const [digits, setDigits] = useState(() =>
    Array.from({ length: verificationCodeLength }, () => ''),
  );
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
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
  const confirmTop = Math.max(verticalValue(285, 238), signUpBrandBottom + sectionGap);
  const resendTop = Math.max(verticalValue(629, 530), confirmTop + confirmContentHeight + 16);

  const updateDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    if (digit && index < verificationCodeLength - 1) inputRefs.current[index + 1]?.focus();
  };

  const verifyCode = async () => {
    if (verifyInFlightRef.current) return;
    const token = digits.join('');
    if (!email) {
      Alert.alert('이메일 정보가 없습니다', '이메일을 다시 입력해 주세요.');
      router.replace('/signup/step1');
      return;
    }
    if (token.length !== verificationCodeLength) {
      Alert.alert('인증번호를 확인해 주세요', '인증번호 6자리를 모두 입력해 주세요.');
      return;
    }

    verifyInFlightRef.current = true;
    setIsVerifying(true);
    try {
      // Supabase 이메일 템플릿에 {{ .Token }}이 포함되어 있어야 6자리 OTP UI와 호환됩니다.
      const { error } = await getSupabaseClient().auth.verifyOtp({
        email,
        token,
        type: 'signup',
      });
      if (error) throw error;
      router.push('/signup/step3');
    } catch (error) {
      console.error('이메일 인증 실패:', error);
      Alert.alert(
        '이메일 인증에 실패했습니다',
        getSignupAuthErrorMessage(error, '인증번호를 다시 확인해 주세요.'),
      );
    } finally {
      verifyInFlightRef.current = false;
      setIsVerifying(false);
    }
  };

  const resendCode = async () => {
    if (resendInFlightRef.current) return;
    if (!email) {
      Alert.alert('이메일 정보가 없습니다', '이메일을 다시 입력해 주세요.');
      return;
    }

    resendInFlightRef.current = true;
    setIsResending(true);
    try {
      const { error } = await getSupabaseClient().auth.resend({ type: 'signup', email });
      if (error) throw error;
      setDigits(Array.from({ length: verificationCodeLength }, () => ''));
      inputRefs.current[0]?.focus();
      Alert.alert('인증 메일을 다시 보냈습니다', '새로 받은 인증번호 6자리를 입력해 주세요.');
    } catch (error) {
      console.error('인증 메일 재발송 실패:', error);
      Alert.alert(
        '인증 메일을 보내지 못했습니다',
        getSignupAuthErrorMessage(error, '잠시 후 다시 시도해 주세요.'),
      );
    } finally {
      resendInFlightRef.current = false;
      setIsResending(false);
    }
  };

  return (
    <SignUpScreenLayout
      alignStepCta
      ctaLabel="다음"
      ctaDisabled={digits.some((digit) => !digit)}
      ctaLoading={isVerifying}
      currentStep={2}
      onBack={() => router.back()}
      onContinue={() => void verifyCode()}
    >
      <SignUpSection innerStyle={styles.confirmContent} top={confirmTop}>
        <Text style={styles.sectionTitle}>이메일 인증</Text>
        <Text style={styles.description}>
          입력하신 이메일로 인증번호를 발송했어요.{`\n`}인증번호 6자리를 입력해주세요.
        </Text>
        <View style={styles.emailCard}>
          <View style={styles.emailLeft}>
            <View style={styles.fieldIcon}>
              <EmailIcon color={colors.textNavigator} height={18} width={18} />
            </View>
            <Text numberOfLines={1} style={styles.emailText}>
              {email}
            </Text>
          </View>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
            <Text style={styles.changeEmail}>이메일 변경</Text>
          </Pressable>
        </View>
        <View style={styles.codeRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              accessibilityLabel={`인증번호 ${index + 1}번째 자리`}
              autoFocus={index === 0}
              keyboardType="number-pad"
              maxLength={1}
              onChangeText={(value) => updateDigit(index, value)}
              onFocus={() => setFocusedIndex(index)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
                  inputRefs.current[index - 1]?.focus();
                }
              }}
              selectTextOnFocus
              style={[styles.codeInput, focusedIndex === index && styles.codeInputFocused]}
              value={digit}
            />
          ))}
        </View>
      </SignUpSection>

      <SignUpSection innerStyle={styles.resendContent} top={resendTop}>
        <Text style={styles.resendQuestion}>이메일을 받지 못하였나요?</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isResending}
          hitSlop={8}
          onPress={() => void resendCode()}
        >
          <Text style={[styles.resendLink, isResending && styles.resendLinkDisabled]}>
            {isResending ? '재발송 중...' : '인증 메일 재발송'}
          </Text>
        </Pressable>
      </SignUpSection>
    </SignUpScreenLayout>
  );
}

const styles = StyleSheet.create({
  confirmContent: {
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
  description: {
    ...typography.body,
    color: colors.textBody,
    fontSize: 15,
    height: 44,
    includeFontPadding: false,
    lineHeight: 22,
  },
  emailCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    height: 55,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  emailLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  fieldIcon: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  emailText: {
    ...typography.body,
    color: colors.textNavigator,
    flex: 1,
    includeFontPadding: false,
    lineHeight: 17,
  },
  changeEmail: {
    ...typography.body,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 19,
    marginLeft: 10,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    width: '100%',
  },
  codeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textBody,
    flex: 1,
    fontFamily: fontFamilies.pretendardLight,
    fontSize: 25,
    height: 45,
    includeFontPadding: false,
    maxWidth: 45,
    padding: 0,
    textAlign: 'center',
  },
  codeInputFocused: {
    borderColor: colors.primary,
  },
  resendContent: {
    alignItems: 'center',
    gap: 10,
  },
  resendQuestion: {
    ...typography.body,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 19,
  },
  resendLink: {
    ...typography.body,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 19,
  },
  resendLinkDisabled: {
    opacity: 0.55,
  },
});
