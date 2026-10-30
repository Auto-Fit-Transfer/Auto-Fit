import { useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import GoogleIcon from '@/assets/icons/auth-redesign/1aa1b.svg';
import KakaoIcon from '@/assets/icons/auth-redesign/e9a73.svg';
import { AuthButton, AuthCard, AuthPage, AuthTextField } from '@/src/components/auth/AuthRedesign';
import {
  signInWithSocialProvider,
  type SocialLoginProvider,
} from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { getSupabaseClient } from '@/src/lib/supabase';
import { colors, fontFamilies } from '@/src/theme';

type SocialLoginButtonProps = {
  disabled: boolean;
  label: string;
  icon: ComponentType<SvgProps>;
  onPress: () => void;
  google?: boolean;
};

function SocialLoginButton({
  disabled,
  label,
  icon: Icon,
  onPress,
  google = false,
}: SocialLoginButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}
    >
      <View style={styles.socialIconBox}>
        <Icon height={google ? 50 : 30} width={google ? 50 : 30} />
      </View>
      <Text style={styles.socialLabel}>{label}</Text>
      <View style={styles.socialSpacer} />
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { oauthError } = useLocalSearchParams<{ oauthError?: string | string[] }>();
  const passwordRef = useRef<TextInput>(null);
  const activeLoginProviderRef = useRef<'email' | SocialLoginProvider | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>(() =>
    Array.isArray(oauthError) ? oauthError[0] : oauthError,
  );
  const [activeLoginProvider, setActiveLoginProvider] = useState<
    'email' | SocialLoginProvider | null
  >(null);

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (activeLoginProviderRef.current) return;
    activeLoginProviderRef.current = 'email';
    setActiveLoginProvider('email');
    setLoginError(undefined);
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.replace(await getPostLoginDestination());
    } catch (error) {
      console.error('로그인 실패:', error);
      setLoginError(error instanceof Error ? error.message : '로그인 정보를 확인해 주세요.');
    } finally {
      activeLoginProviderRef.current = null;
      setActiveLoginProvider(null);
    }
  };

  const handleSocialLogin = async (provider: SocialLoginProvider) => {
    Keyboard.dismiss();
    if (activeLoginProviderRef.current) return;
    activeLoginProviderRef.current = provider;
    setActiveLoginProvider(provider);
    setLoginError(undefined);
    try {
      const result = await signInWithSocialProvider(provider);
      if (result.status === 'success') router.replace(await getPostLoginDestination());
    } catch (error) {
      console.error(`${provider} 로그인 실패:`, error);
      setLoginError(error instanceof Error ? error.message : '소셜 로그인에 실패했습니다.');
    } finally {
      activeLoginProviderRef.current = null;
      setActiveLoginProvider(null);
    }
  };

  return (
    <AuthPage mode="login">
      <AuthCard style={styles.loginCard}>
        <AuthTextField
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
          textContentType="emailAddress"
          value={email}
        />
        <AuthTextField
          ref={passwordRef}
          accessibilityLabel="비밀번호"
          autoCapitalize="none"
          autoComplete="password"
          error={loginError}
          label="비밀번호"
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
          placeholder="비밀번호를 입력해 주세요"
          returnKeyType="done"
          rightElement={
            <Pressable
              accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setPasswordVisible(!passwordVisible)}
            >
              {passwordVisible ? (
                <EyeIcon height={20} width={20} />
              ) : (
                <EyeSlashIcon height={20} width={20} />
              )}
            </Pressable>
          }
          secureTextEntry={!passwordVisible}
          textContentType="password"
          value={password}
        />
        <AuthButton
          loading={activeLoginProvider === 'email'}
          onPress={handleLogin}
          title="로그인"
        />
        <View style={styles.accountLinks}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/password/forgot')}>
            <Text style={styles.link}>비밀번호 찾기</Text>
          </Pressable>
          <Text style={styles.linkDivider}>|</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/signup/step1')}>
            <Text style={styles.link}>회원가입</Text>
          </Pressable>
        </View>
      </AuthCard>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>또는</Text>
        <View style={styles.dividerLine} />
      </View>
      <View style={styles.socialGroup}>
        <SocialLoginButton
          disabled={activeLoginProvider !== null}
          icon={KakaoIcon}
          label="Kakao로 계속하기"
          onPress={() => void handleSocialLogin('kakao')}
        />
        <SocialLoginButton
          disabled={activeLoginProvider !== null}
          google
          icon={GoogleIcon}
          label="Google로 계속하기"
          onPress={() => void handleSocialLogin('google')}
        />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  loginCard: { gap: 18 },
  accountLinks: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 15,
    justifyContent: 'center',
    paddingTop: 3,
  },
  linkDivider: { color: '#D3D3DC' },
  link: {
    color: '#777780',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    lineHeight: 22,
  },
  divider: { alignItems: 'center', flexDirection: 'row', gap: 12, height: 24 },
  dividerLine: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
  },
  socialGroup: { gap: 10 },
  socialButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 50,
    paddingHorizontal: 16,
  },
  socialIconBox: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 24,
  },
  socialLabel: {
    color: colors.dark,
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  socialSpacer: { width: 24 },
  pressed: { opacity: 0.75 },
});
