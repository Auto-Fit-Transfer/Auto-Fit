import { useState } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import EmailIcon from '@/assets/icons/auth-redesign/1790c.svg';
import EmailEmblem from '@/assets/icons/auth-redesign/c08e0.svg';
import ShieldIcon from '@/assets/icons/auth-redesign/6e53a.svg';
import { AuthButton, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { PasswordAuthScreenLayout, PasswordAuthSection } from '@/src/components/auth';
import { getSupabaseClient } from '@/src/lib/supabase';
import { colors, fontFamilies } from '@/src/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
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
      Alert.alert('메일 발송을 요청했습니다', '가입된 이메일이라면 비밀번호 재설정 링크가 도착합니다.');
    } catch (error) {
      console.error('비밀번호 재설정 메일 요청 실패:', error);
      Alert.alert('메일을 보내지 못했습니다', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PasswordAuthScreenLayout
      description="가입한 이메일로 비밀번호 재설정 링크를 보내드려요."
      onBack={() => router.back()}
      title="비밀번호 찾기"
    >
      <PasswordAuthSection top={0} innerStyle={styles.recoveryCard}>
        <View style={styles.emblem}>
          <EmailEmblem height={28} width={28} />
        </View>
        <AuthTextField
          accessibilityLabel="이메일"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label="이메일"
          leftElement={<EmailIcon height={20} width={20} />}
          onChangeText={setEmail}
          onSubmitEditing={() => void sendResetEmail()}
          placeholder="가입 시 입력한 이메일을 입력해 주세요"
          returnKeyType="send"
          textContentType="emailAddress"
          value={email}
        />
        <AuthButton loading={isSending} onPress={() => void sendResetEmail()} title="인증 메일 보내기" />
      </PasswordAuthSection>
      <PasswordAuthSection card={false} top={0} innerStyle={styles.notice}>
        <ShieldIcon height={24} width={24} />
        <View style={styles.noticeText}>
          <Text style={styles.noticeTitle}>안전하게 비밀번호를 재설정해요</Text>
          <Text style={styles.noticeDescription}>
            입력하신 이메일로 재설정 링크를 보내드려요.{`\n`}링크는 10분 동안 유효합니다.
          </Text>
        </View>
      </PasswordAuthSection>
      <PasswordAuthSection top={0} innerStyle={styles.help}>
        <Text style={styles.helpTitle}>메일이 오지 않나요?</Text>
        <Text style={styles.helpDescription}>
          스팸 메일함을 확인하거나{`\n`}잠시 후 다시 시도해 주세요.
        </Text>
      </PasswordAuthSection>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/login')}
        style={styles.backToLogin}
      >
        <Text style={styles.backToLoginText}>로그인으로 돌아가기</Text>
      </Pressable>
    </PasswordAuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  recoveryCard: { gap: 20 },
  emblem: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  notice: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 98,
    padding: 16,
  },
  noticeText: { flex: 1, gap: 4 },
  noticeTitle: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  noticeDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
  },
  help: { gap: 8 },
  helpTitle: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  helpDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    lineHeight: 23,
  },
  backToLogin: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  backToLoginText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
});
