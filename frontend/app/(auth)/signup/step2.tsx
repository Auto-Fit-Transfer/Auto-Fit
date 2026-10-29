import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, TextInput, View } from 'react-native';

import EnvelopeIcon from '@/assets/icons/ui/envelope.svg';
import { SignUpScreenLayout } from '@/src/components/auth';
import { AppButton, noWebFocusRing, Notice, Text } from '@/src/components/common';
import { useSignup } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { radius, scaleForEasyMode, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const verificationCodeLength = 6;
// Matches otp_expiry (600 seconds) in backend/supabase/config.toml.
const codeLifetimeMs = 10 * 60 * 1000;

function formatTimeLeft(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Figma A5.
export default function SignUpStep2Screen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { draft } = useSignup();
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
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + codeLifetimeMs);
  const [now, setNow] = useState(() => Date.now());
  const timeLeft = expiresAt - now;

  useEffect(() => {
    if (timeLeft <= 0) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft]);

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
      setExpiresAt(Date.now() + codeLifetimeMs);
      setNow(Date.now());
      inputRefs.current[0]?.focus();
      Alert.alert('메일을 다시 보냈어요', '새로 받은 6자리를 입력해 주세요.');
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
      ctaLabel="다음"
      ctaDisabled={digits.some((digit) => !digit)}
      ctaLoading={isVerifying}
      currentStep={2}
      onBack={() => router.back()}
      onContinue={() => void verifyCode()}
    >
      <View style={styles.emailBox}>
        <EnvelopeIcon color={colors.textSecondary} height={20} width={20} />
        <Text numberOfLines={1} style={styles.emailText}>
          {email}
        </Text>
        <AppButton
          fullWidth={false}
          onPress={() => router.back()}
          size="S"
          title="이메일 바꾸기"
          variant="outline"
        />
      </View>
      <View style={styles.codeBlock}>
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
                if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0)
                  inputRefs.current[index - 1]?.focus();
              }}
              selectTextOnFocus
              style={[styles.codeInput, focusedIndex === index && styles.codeInputFocused]}
              value={digit}
            />
          ))}
        </View>
        <View style={styles.timerRow}>
          <Text style={styles.timer}>
            {timeLeft > 0
              ? `남은 시간 ${formatTimeLeft(timeLeft)}`
              : '시간이 지났어요. 다시 보내 주세요.'}
          </Text>
          <AppButton
            disabled={isResending}
            fullWidth={false}
            loading={isResending}
            onPress={() => void resendCode()}
            size="S"
            title="다시 보내기"
            variant="outline"
          />
        </View>
      </View>
      <Notice body="메일이 안 보이면 스팸함도 확인해 주세요." />
    </SignUpScreenLayout>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  // TextInput is not the shared Text, so it is enlarged here for the easy mode.
  const codeText = easyMode ? scaleForEasyMode(text.title1) : text.title1;
  return {
    emailBox: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      paddingLeft: 16,
      paddingRight: 12,
      paddingVertical: 12,
    },
    emailText: { ...text.body1Strong, color: colors.textPrimary, flex: 1 },
    codeBlock: { gap: 16 },
    codeRow: { flexDirection: 'row', gap: 8 },
    codeInput: {
      ...codeText,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      color: colors.textPrimary,
      flex: 1,
      height: easyMode ? 68 : 60,
      lineHeight: undefined,
      minWidth: 0,
      padding: 0,
      textAlign: 'center',
      ...noWebFocusRing,
    },
    codeInputFocused: {
      backgroundColor: colors.background,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    timerRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    timer: { ...text.body2, color: colors.textSecondary, flex: 1 },
  } as const;
}
