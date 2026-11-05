import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Pressable,
  TextInput,
  View } from 'react-native';

import EmailIcon from '@/assets/icons/input/Email.svg';
import NoticeIcon from '@/assets/icons/auth-redesign/info-circle.svg';
import { SignUpScreenLayout } from '@/src/components/auth';
import { useSignup } from '@/src/features/signup/SignupContext';
import { getSignupAuthErrorMessage } from '@/src/features/signup/signupAuthError';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

const verificationCodeLength = 6;

export default function SignUpStep2Screen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
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
      ctaLabel="다음"
      ctaDisabled={digits.some((digit) => !digit)}
      ctaLoading={isVerifying}
      currentStep={2}
      totalSteps={5}
      onBack={() => router.back()}
      onContinue={() => void verifyCode()}
    >
      <View style={styles.emailCard}>
        <EmailIcon height={20} width={20} />
        <Text numberOfLines={1} style={styles.emailText}>
          {email}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>이메일 바꾸기</Text>
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
              if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0)
                inputRefs.current[index - 1]?.focus();
            }}
            selectTextOnFocus
            style={[styles.codeInput, focusedIndex === index && styles.codeInputFocused]}
            value={digit}
          />
        ))}
      </View>
      <View style={styles.resendRow}>
        <Pressable
          accessibilityRole="button"
          disabled={isResending}
          hitSlop={8}
          onPress={() => void resendCode()}
          style={[styles.smallButton, isResending && styles.resendDisabled]}
        >
          <Text style={styles.smallButtonText}>{isResending ? '보내는 중...' : '다시 보내기'}</Text>
        </Pressable>
      </View>
      <View style={styles.notice}>
        <NoticeIcon height={20} width={20} />
        <Text style={styles.noticeText}>메일이 안 보이면 스팸함도 확인해 주세요.</Text>
      </View>
    </SignUpScreenLayout>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    emailCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      height: 58,
      paddingLeft: 16,
      paddingRight: 8,
    },
    emailText: {
      color: colors.textPrimary,
      flex: 1,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
    },
    smallButton: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    smallButtonText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    codeRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    codeInput: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.textPrimary,
      flex: 1,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 22,
      height: 60,
      minWidth: 0,
      padding: 0,
      textAlign: 'center',
    },
    codeInputFocused: { borderColor: colors.primary, borderWidth: 2 },
    resendRow: { alignItems: 'flex-end', marginTop: -16 },
    resendDisabled: { opacity: 0.55 },
    notice: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 51,
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    noticeText: { color: colors.textBody, flex: 1, fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
  } as const;
}
