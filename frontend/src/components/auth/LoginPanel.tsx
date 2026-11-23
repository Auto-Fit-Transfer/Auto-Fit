import { logError } from '@/src/lib/logError';
import { useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, Pressable, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import GoogleIcon from '@/assets/icons/auth-redesign/google-logo.svg';
import KakaoIcon from '@/assets/icons/auth-redesign/kakao-symbol.svg';
import { aForm } from '@/src/components/a/form';
import { AuthButton, AuthCard, AuthPage, AuthTextField } from '@/src/components/auth/AuthRedesign';
import {
  signInWithSocialProvider,
  type SocialLoginProvider,
} from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { getSupabaseClient } from '@/src/lib/supabase';
import { useThemedStyles, type AppTheme } from '@/src/theme';
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

// The e-mail and social login, as a panel: renewal B's first screen (app/(auth)/login.tsx) opens it from
// its '로그인' link, and 회원가입 goes back to the one-sentence sign-up there.
export function LoginPanel({ onJoin }: { onJoin?: () => void }) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { oauthError } = useLocalSearchParams<{ oauthError?: string | string[] }>();
  const passwordRef = useRef<TextInput>(null);
  const activeLoginProviderRef = useRef<'email' | SocialLoginProvider | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  // Links can set this value, so it only ever selects our own sentence.
  const [loginError, setLoginError] = useState<string | undefined>(() =>
    oauthError ? '소셜 로그인에 실패했어요. 다시 시도해 주세요.' : undefined,
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
      logError('로그인 실패', error);
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
      logError(`${provider} 로그인 실패`, error);
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
          onChangeText={setEmail}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="이메일"
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
          fieldStyle={styles.withMini}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
          placeholder="비밀번호"
          returnKeyType="done"
          rightElement={
            <Pressable
              accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setPasswordVisible(!passwordVisible)}
              style={styles.mini}
            >
              <Text style={styles.miniText}>{passwordVisible ? '숨기기' : '보기'}</Text>
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
      </AuthCard>
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
      <View style={styles.accountLinks}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/password/forgot')} style={styles.linkButton}>
          <Text style={styles.link}>비밀번호 찾기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onJoin ?? (() => router.push('/signup/step1'))} style={styles.linkButton}>
          <Text style={styles.link}>회원가입</Text>
        </Pressable>
      </View>
    </AuthPage>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    loginCard: { gap: 8 },
    loginButton: { marginTop: 6 },
    withMini: { paddingRight: 6 },
    mini: a.mini,
    miniText: a.miniText,
    // Kakao and Google side by side, each on a small ledge.
    socialGroup: { flexDirection: 'row', gap: 8, marginTop: 14, paddingBottom: 3 },
    socialButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)',
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      height: 46,
      justifyContent: 'center',
    },
    kakaoButton: { backgroundColor: '#FEE500' },
    socialLabel: { ...a.p12, color: colors.ink },
    kakaoLabel: { color: '#191919' },
    accountLinks: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'center', marginTop: 4 },
    linkButton: { alignItems: 'center', height: 44, justifyContent: 'center' },
    link: a.link,
    pressed: { opacity: 0.75 },
  } as const;
}
