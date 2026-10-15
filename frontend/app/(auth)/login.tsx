import { useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmailIcon from '@/assets/icons/input/Email.svg';
import EyeIcon from '@/assets/icons/input/Eye.svg';
import EyeCloseIcon from '@/assets/icons/input/EyeClose.svg';
import PasswordIcon from '@/assets/icons/input/Password.svg';
import LogoIcon from '@/assets/icons/Logo_Auto-Fit.svg';
import GoogleIcon from '@/assets/icons/social/Google.svg';
import KakaoIcon from '@/assets/icons/social/Kakao.svg';
import { AppButton, AppTextField, IconButton } from '@/src/components/common';
import {
  signInWithSocialProvider,
  type SocialLoginProvider,
} from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { getSupabaseClient } from '@/src/lib/supabase';
import { colors, radius, spacing, typography } from '@/src/theme';

const authBackground = require('../../assets/images/backgrounds/2_Auth.png');

const referenceWidth = 412;

const minimumScreenHeight = 740;
const maximumScreenHeight = 917;

const figmaContentTop = 80;
const figmaBrandToFormGap = 71.521;
const formGroupUpwardAdjustment = spacing.sm;

type SocialLoginButtonProps = {
  disabled?: boolean;
  label: string;
  icon: ComponentType<SvgProps>;
  onPress: () => void;
  style?: ViewStyle;
};

function SocialLoginButton({
  disabled = false,
  label,
  icon: SocialIcon,
  onPress,
  style,
}: SocialLoginButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, pressed && styles.pressed, style]}
    >
      <View style={styles.socialIconBox}>
        <SocialIcon height={50} width={50} />
      </View>

      <Text style={styles.socialLabel}>{label}</Text>

      <View style={styles.socialBalance} />
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { oauthError } = useLocalSearchParams<{ oauthError?: string | string[] }>();
  const insets = useSafeAreaInsets();

  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const passwordRef = useRef<TextInput>(null);
  const activeLoginProviderRef = useRef<'email' | SocialLoginProvider | null>(null);

  const [email, setEmail] = useState('');
  const [loginError, setLoginError] = useState<string | undefined>(() =>
    Array.isArray(oauthError) ? oauthError[0] : oauthError,
  );
  const [activeLoginProvider, setActiveLoginProvider] = useState<
    'email' | SocialLoginProvider | null
  >(null);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

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

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const openSignUp = () => {
    Keyboard.dismiss();
    router.push('/signup/step1');
  };

  const openForgotPassword = () => {
    Keyboard.dismiss();
    router.push('/password/forgot');
  };

  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);

  const widthScale = Math.min(1, availableWidth / referenceWidth);

  const scaledWidth = referenceWidth * widthScale;

  const canvasLeft = insets.left + (availableWidth - scaledWidth) / 2;

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

  const contentTop = Math.max(insets.top, verticalValue(figmaContentTop, 42));

  const brandToFormGap = verticalValue(figmaBrandToFormGap - formGroupUpwardAdjustment, 34);

  const dividerTopGap = verticalValue(spacing.xl, 13);

  const socialTopGap = verticalValue(spacing.xl, 13);

  const socialGap = verticalValue(17, 10);

  return (
    <View style={styles.background}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={authBackground}
        style={styles.backgroundImage}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <Pressable accessible={false} onPress={dismissKeyboard} style={styles.keyboardDismissArea}>
          <View style={styles.contentViewport}>
            <View
              style={[
                styles.contentContainer,
                {
                  left: canvasLeft,
                  top: contentTop,
                  transform: [
                    {
                      scale: widthScale,
                    },
                  ],
                },
              ]}
            >
              <View style={styles.brandSection}>
                <LogoIcon accessibilityLabel="Auto-Fit 로고" height={68.479} width={71.591} />

                <Text style={styles.brandName}>Auto-Fit</Text>

                <Text style={styles.tagline}>
                  <Text style={styles.taglineAccent}>AI</Text>가 함께하는 나만의 헬스케어
                </Text>
              </View>

              <View
                style={[
                  styles.form,
                  {
                    marginTop: brandToFormGap,
                  },
                ]}
              >
                <AppTextField
                  accessibilityLabel="이메일"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  leftElement={
                    <View style={styles.inputIconSlot}>
                      <EmailIcon color={colors.textNavigator} height={18} width={18} />
                    </View>
                  }
                  onChangeText={setEmail}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="이메일을 입력해주세요"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  value={email}
                />

                <AppTextField
                  ref={passwordRef}
                  accessibilityLabel="비밀번호"
                  autoCapitalize="none"
                  autoComplete="password"
                  error={loginError}
                  leftElement={
                    <View style={styles.inputIconSlot}>
                      <PasswordIcon color={colors.textNavigator} height={18} width={18} />
                    </View>
                  }
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  placeholder="비밀번호를 입력해주세요"
                  returnKeyType="done"
                  rightElement={
                    <IconButton
                      accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                      icon={
                        passwordVisible ? (
                          <EyeIcon color={colors.textNavigator} height={18} width={18} />
                        ) : (
                          <EyeCloseIcon color={colors.textNavigator} height={18} width={18} />
                        )
                      }
                      onPress={() => setPasswordVisible((visible) => !visible)}
                      size={44}
                      style={styles.eyeButton}
                    />
                  }
                  secureTextEntry={!passwordVisible}
                  textContentType="password"
                  value={password}
                />

                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={openForgotPassword}
                  style={styles.forgotPasswordButton}
                >
                  <Text style={styles.forgotPasswordText}>비밀번호 찾기</Text>
                </Pressable>

                <AppButton
                  loading={activeLoginProvider === 'email'}
                  onPress={handleLogin}
                  title="로그인"
                />
              </View>

              <View
                accessible={false}
                style={[
                  styles.divider,
                  {
                    marginTop: dividerTopGap,
                  },
                ]}
              >
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>또는</Text>
                <View style={styles.dividerLine} />
              </View>

              <View
                style={[
                  styles.socialSection,
                  {
                    gap: socialGap,
                    marginTop: socialTopGap,
                  },
                ]}
              >
                <SocialLoginButton
                  disabled={activeLoginProvider !== null}
                  icon={GoogleIcon}
                  label="Google로 계속하기"
                  onPress={() => void handleSocialLogin('google')}
                />

                <SocialLoginButton
                  disabled={activeLoginProvider !== null}
                  icon={KakaoIcon}
                  label="Kakao로 계속하기"
                  onPress={() => void handleSocialLogin('kakao')}
                />

                <View style={styles.signUpGuide}>
                  <Text style={styles.signUpGuideText}>계정이 없으신가요?</Text>

                  <Pressable accessibilityRole="button" hitSlop={8} onPress={openSignUp}>
                    <Text style={styles.signUpLinkText}>회원가입</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    width: '100%',
  },

  backgroundImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },

  keyboardAvoidingView: {
    flex: 1,
    width: '100%',
  },

  keyboardDismissArea: {
    flex: 1,
    width: '100%',
  },

  contentViewport: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },

  contentContainer: {
    alignItems: 'center',
    paddingHorizontal: 31,
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },

  brandSection: {
    alignItems: 'center',
    paddingVertical: 25,
    width: '100%',
  },

  brandName: {
    ...typography.display,
    color: colors.textBody,
    height: 50,
    includeFontPadding: false,
    marginTop: 6,
    textAlign: 'center',
    width: 200,
  },

  tagline: {
    ...typography.body,
    color: colors.textBody,
    height: 17,
    includeFontPadding: false,
    lineHeight: 17,
    textAlign: 'center',
    width: 252,
  },

  taglineAccent: {
    color: colors.primary,
  },

  form: {
    alignSelf: 'center',
    gap: spacing.sm,
    maxWidth: 350,
    width: '100%',
  },

  eyeButton: {
    marginRight: -11,
  },

  inputIconSlot: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },

  forgotPasswordButton: {
    alignSelf: 'flex-end',
    justifyContent: 'center',
    minHeight: 14,
  },

  forgotPasswordText: {
    ...typography.label,
    color: colors.primaryDark,
    includeFontPadding: false,
    lineHeight: 14,
  },

  divider: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    height: 16,
    maxWidth: 350,
    width: '100%',
  },

  dividerLine: {
    backgroundColor: colors.textDisabled,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },

  dividerLabel: {
    ...typography.label,
    color: colors.textDisabled,
    includeFontPadding: false,
    lineHeight: 14,
  },

  socialSection: {
    alignSelf: 'center',
    maxWidth: 350,
    width: '100%',
  },

  socialButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    height: 45,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },

  socialIconBox: {
    alignItems: 'center',
    height: 50,
    justifyContent: 'center',
    marginLeft: 10,
    width: 50,
  },

  socialBalance: {
    marginRight: 10,
    width: 50,
  },

  socialLabel: {
    ...typography.bodySmall,
    color: colors.textBody,
    includeFontPadding: false,
    lineHeight: 16,
    textAlign: 'center',
  },

  signUpGuide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },

  signUpGuideText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    includeFontPadding: false,
    lineHeight: 16,
  },

  signUpLinkText: {
    ...typography.bodySmall,
    color: colors.primaryDark,
    fontFamily: typography.label.fontFamily,
    includeFontPadding: false,
    lineHeight: 16,
  },

  pressed: {
    opacity: 0.7,
  },
});
