import { useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, Pressable, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import GoogleIcon from '@/assets/icons/auth-redesign/google-logo.svg';
import KakaoIcon from '@/assets/icons/auth-redesign/kakao-symbol.svg';
import { AuthButton, AuthCard, AuthPage, AuthTextField } from '@/src/components/auth/AuthRedesign';
import {
  signInWithSocialProvider,
  type SocialLoginProvider,
} from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

type SocialLoginButtonProps = {
  disabled: boolean;
  label: string;
  icon: ComponentType<SvgProps>;
  onPress: () => void;
  kakao?: boolean;
};

function SocialLoginButton({
  disabled,
  label,
  icon: Icon,
  onPress,
  kakao = false,
}: SocialLoginButtonProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, kakao && styles.kakaoButton, pressed && styles.pressed]}
    >
      <Icon height={kakao ? 20 : 18} width={kakao ? 20 : 18} />
      <Text style={[styles.socialLabel, kakao && styles.kakaoLabel]}>{label}</Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const styles = useThemedStyles(createStyles);
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
          placeholder="example@email.com"
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
                <EyeSlashIcon height={22} width={22} />
              ) : (
                <EyeIcon height={22} width={22} />
              )}
            </Pressable>
          }
          secureTextEntry={!passwordVisible}
          textContentType="password"
          value={password}
        />
        <View style={styles.loginButton}>
          <AuthButton
            loading={activeLoginProvider === 'email'}
            onPress={handleLogin}
            title="로그인"
          />
        </View>
        <View style={styles.accountLinks}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/password/forgot')} style={styles.linkButton}>
            <Text style={styles.link}>비밀번호 찾기</Text>
          </Pressable>
          <View style={styles.linkDivider} />
          <Pressable accessibilityRole="button" onPress={() => router.push('/signup/step1')} style={styles.linkButton}>
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
          kakao
          label="카카오로 계속하기"
          onPress={() => void handleSocialLogin('kakao')}
        />
        <SocialLoginButton
          disabled={activeLoginProvider !== null}
          icon={GoogleIcon}
          label="Google로 계속하기"
          onPress={() => void handleSocialLogin('google')}
        />
      </View>
    </AuthPage>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    loginCard: { gap: 16 },
    loginButton: { marginTop: 8 },
    accountLinks: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'center',
      marginTop: -8,
    },
    linkButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 120 },
    linkDivider: { backgroundColor: colors.border, height: 12, width: 1 },
    link: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
      lineHeight: 21,
    },
    divider: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16, marginTop: 'auto', paddingTop: 24 },
    dividerLine: { backgroundColor: colors.border, flex: 1, height: 1 },
    dividerText: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 14,
      lineHeight: 21,
    },
    socialGroup: { gap: 8 },
    socialButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      height: 56,
      justifyContent: 'center',
    },
    kakaoButton: { backgroundColor: '#FEE500', borderWidth: 0 },
    socialLabel: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
    },
    kakaoLabel: { color: '#000000' },
    pressed: { opacity: 0.75 },
  } as const;
}
