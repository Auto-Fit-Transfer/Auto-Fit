import { logError } from '@/src/lib/logError';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, Platform, Pressable, View } from 'react-native';

import EmailIcon from '@/assets/icons/input/Email.svg';
import InfoIcon from '@/assets/icons/auth-redesign/info-circle.svg';
import { AuthButton, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { PasswordAuthScreenLayout } from '@/src/components/auth';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

const resendSeconds = 60;
const formatSentAt = (date: Date) => {
  const hour = date.getHours();
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export default function ForgotPasswordScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [wait, setWait] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

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
      setResent(sentAt !== null);
      setSentAt(new Date());
      setWait(resendSeconds);
    } catch (error) {
      logError('비밀번호 재설정 메일 요청 실패', error);
      Alert.alert('메일을 보내지 못했습니다', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSending(false);
    }
  };

  const openMailApp = () => {
    // shortcut: mailto opens a new message on Android, not the inbox; replace it when a device check shows it matters.
    void Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:').catch(() => undefined);
  };

  const backToLogin = (
    <Pressable accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.backToLogin}>
      <Text style={styles.backToLoginText}>로그인으로 돌아가기</Text>
    </Pressable>
  );

  if (sentAt) {
    return (
      <PasswordAuthScreenLayout
        description={'아래 주소로 비밀번호를 새로 정하는 링크를 보냈어요.\n링크는 10분 동안 쓸 수 있어요.'}
        footer={
          <>
            <AuthButton onPress={openMailApp} title="메일 앱 열기" />
            {backToLogin}
          </>
        }
        onBack={() => setSentAt(null)}
        title="메일을 보냈어요"
      >
        <View style={styles.sentCard}>
          <View style={styles.sentRow}>
            <EmailIcon height={20} width={20} />
            <View style={styles.sentCopy}>
              <Text numberOfLines={1} style={styles.sentEmail}>{email.trim().toLowerCase()}</Text>
              <Text style={styles.sentTime}>{formatSentAt(sentAt)}에 보냈어요</Text>
            </View>
          </View>
          <View style={styles.sentActions}>
            <Pressable accessibilityRole="button" onPress={() => setSentAt(null)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>주소 바꾸기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: wait > 0 || isSending }}
              disabled={wait > 0 || isSending}
              onPress={() => void sendResetEmail()}
              style={styles.smallButton}
            >
              <Text style={[styles.smallButtonText, wait > 0 && styles.smallButtonDisabled]}>
                {wait > 0 ? `다시 보내기 ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}` : '다시 보내기'}
              </Text>
            </Pressable>
          </View>
        </View>
        {resent ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>메일을 다시 보냈어요</Text>
          </View>
        ) : null}
        <View style={styles.notice}>
          <InfoIcon height={20} width={20} />
          <View style={styles.sentCopy}>
            <Text style={styles.noticeTitle}>메일이 안 오나요?</Text>
            <Text style={styles.noticeText}>스팸함을 확인해 보세요.</Text>
          </View>
        </View>
      </PasswordAuthScreenLayout>
    );
  }

  return (
    <PasswordAuthScreenLayout
      description="가입한 이메일로 새 비밀번호를 정하는 링크를 보내 드려요. 링크는 10분 동안 쓸 수 있어요."
      footer={
        <>
          <AuthButton loading={isSending} onPress={() => void sendResetEmail()} title="링크 보내기" />
          {backToLogin}
        </>
      }
      onBack={() => router.back()}
      title="비밀번호를 잊으셨나요?"
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
    </PasswordAuthScreenLayout>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    backToLogin: { alignItems: 'center', height: 44, justifyContent: 'center', marginTop: 8 },
    backToLoginText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    sentCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 16,
    },
    sentRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    sentCopy: { flex: 1, gap: 2 },
    sentEmail: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    sentTime: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    sentActions: { flexDirection: 'row', gap: 8 },
    smallButton: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      height: 44,
      justifyContent: 'center',
    },
    smallButtonText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    smallButtonDisabled: { color: colors.textDisabled },
    toast: { backgroundColor: colors.tabBar, borderRadius: 12, marginTop: -12, padding: 14 },
    toastText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    notice: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 16,
    },
    noticeTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 21 },
    noticeText: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
  } as const;
}
