import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, View } from 'react-native';

import EnvelopeIcon from '@/assets/icons/ui/envelope.svg';
import { AuthPage, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { AppButton, AppCard, Notice, Text } from '@/src/components/common';
import { getSupabaseClient } from '@/src/lib/supabase';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const resendWaitSeconds = 60;

// Figma A8 (비밀번호 찾기) and, after sending, A10 (링크를 보냈어요).
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [waitLeft, setWaitLeft] = useState(0);

  useEffect(() => {
    if (waitLeft <= 0) return;
    const timer = setTimeout(() => setWaitLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitLeft]);

  const sendResetEmail = async () => {
    if (isSending) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('이메일을 확인해 주세요', '올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    Keyboard.dismiss();
    setIsSending(true);
    try {
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: Linking.createURL('auth/recovery'),
      });
      if (error) throw error;
      setSentAt(new Date());
      setWaitLeft(resendWaitSeconds);
    } catch (error) {
      console.error('비밀번호 재설정 메일 요청 실패:', error);
      Alert.alert('메일을 보내지 못했습니다', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSending(false);
    }
  };

  const backToLogin = (
    <AppButton
      onPress={() => router.replace('/login')}
      title="로그인으로 돌아가기"
      variant="text"
    />
  );

  if (sentAt) {
    const time = sentAt.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    return (
      <AuthPage
        description="아래 주소로 비밀번호를 새로 정하는 링크를 보냈어요. 링크는 10분 동안 쓸 수 있어요."
        footer={backToLogin}
        heading="메일을 보냈어요"
        mode="password"
        onBack={() => setSentAt(null)}
        topIcon={
          <View style={styles.emblem}>
            <EnvelopeIcon color={colors.textPrimary} height={30} width={30} />
          </View>
        }
      >
        <AppCard style={styles.sentBox}>
          <View style={styles.sentRow}>
            <EnvelopeIcon color={colors.textSecondary} height={20} width={20} />
            <View style={styles.flex}>
              <Text style={styles.sentEmail}>{email.trim().toLowerCase()}</Text>
              <Text style={styles.sentTime}>{time}에 보냈어요</Text>
            </View>
          </View>
          <View style={styles.sentActions}>
            <AppButton
              fullWidth={false}
              onPress={() => setSentAt(null)}
              style={styles.flex}
              title="주소 바꾸기"
              variant="outline"
            />
            <AppButton
              disabled={waitLeft > 0 || isSending}
              fullWidth={false}
              onPress={() => void sendResetEmail()}
              style={styles.flex}
              title={
                waitLeft > 0
                  ? `다시 보내기 ${Math.floor(waitLeft / 60)}:${String(waitLeft % 60).padStart(2, '0')}`
                  : '다시 보내기'
              }
              variant="outline"
            />
          </View>
        </AppCard>
        <Notice body="스팸함을 확인해 보세요." title="메일이 안 오나요?" />
      </AuthPage>
    );
  }

  return (
    <AuthPage
      description="가입한 이메일로 새 비밀번호를 정하는 링크를 보내 드려요. 링크는 10분 동안 쓸 수 있어요."
      footer={
        <>
          <AppButton
            loading={isSending}
            onPress={() => void sendResetEmail()}
            title="링크 보내기"
          />
          {backToLogin}
        </>
      }
      heading="비밀번호를 잊으셨나요?"
      mode="password"
      onBack={() => router.back()}
    >
      <AuthTextField
        accessibilityLabel="이메일"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        label="이메일"
        onChangeText={setEmail}
        onSubmitEditing={() => void sendResetEmail()}
        placeholder="example@email.com"
        returnKeyType="send"
        textContentType="emailAddress"
        value={email}
      />
    </AuthPage>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    emblem: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 32,
      height: 64,
      justifyContent: 'center',
      width: 64,
    },
    sentBox: { gap: 12 },
    sentRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    sentEmail: { ...text.body1Strong, color: colors.textPrimary },
    sentTime: { ...text.caption, color: colors.textSecondary },
    sentActions: { flexDirection: 'row', gap: 8 },
  } as const;
}
