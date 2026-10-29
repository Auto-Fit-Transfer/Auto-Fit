import { useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import EyeSlashIcon from '@/assets/icons/auth-redesign/5facc.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import GoogleIcon from '@/assets/icons/auth-redesign/1aa1b.svg';
import KakaoIcon from '@/assets/icons/auth-redesign/e9a73.svg';
import { AuthButton, AuthCard, AuthPage, AuthTextField } from '@/src/components/auth/AuthRedesign';
import { AppButton, Text } from '@/src/components/common';
import {
  signInWithSocialProvider,
  type SocialLoginProvider,
} from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { getSupabaseClient } from '@/src/lib/supabase';
import { useThemedStyles, type AppTheme } from '@/src/theme';

type SocialLoginButtonProps = {
  disabled: boolean;
  label: string;
  icon: ComponentType<SvgProps>;
  onPress: () => void;
  kakao?: boolean;
};

// Kakao keeps its brand yellow; Google is a white button with a thin border (Figma A2).
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
      style={({ pressed }) => [
        styles.socialButton,
        kakao ? styles.kakao : styles.google,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.socialIconBox}>
        <Icon height={kakao ? 26 : 44} width={kakao ? 26 : 44} />
      </View>
      <Text style={[styles.socialLabel, kakao && styles.kakaoLabel]}>{label}</Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
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
      <AuthCard style={styles.fields}>
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
      </AuthCard>
      <View style={styles.actions}>
        <AuthButton
          loading={activeLoginProvider === 'email'}
          onPress={handleLogin}
          title="로그인"
        />
        <View style={styles.links}>
          <AppButton
            fullWidth={false}
            onPress={() => router.push('/password/forgot')}
            size="M"
            title="비밀번호 찾기"
            variant="text"
          />
          <View style={styles.linkDivider} />
          <AppButton
            fullWidth={false}
            onPress={() => router.push('/signup/step1')}
            size="M"
            title="회원가입"
            variant="text"
          />
        </View>
      </View>
      <View style={styles.social}>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.dividerLine} />
        </View>
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

function createStyles({ colors, text }: AppTheme) {
  return {
    fields: { gap: 16 },
    actions: { gap: 8, marginTop: -4 },
    links: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center' },
    linkDivider: { backgroundColor: colors.border, height: 12, width: 1 },
    social: { gap: 8, marginTop: 24 },
    divider: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 8 },
    dividerLine: { backgroundColor: colors.border, flex: 1, height: 1 },
    dividerText: { ...text.body2, color: colors.textSecondary },
    socialButton: {
      alignItems: 'center',
      borderRadius: 12,
      flexDirection: 'row',
      gap: 8,
      height: 56,
      justifyContent: 'center',
    },
    kakao: { backgroundColor: '#FEE500' },
    google: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    socialIconBox: {
      alignItems: 'center',
      height: 24,
      justifyContent: 'center',
      overflow: 'hidden',
      width: 24,
    },
    socialLabel: { ...text.button, color: colors.textPrimary },
    kakaoLabel: { color: 'rgba(0, 0, 0, 0.85)' },
    pressed: { opacity: 0.8 },
  } as const;
}
