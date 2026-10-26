import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/auth-redesign/5cd86.svg';
import LogoIcon from '@/assets/icons/auth-redesign/f36f4.svg';
import { AppTextField, type AppTextFieldProps } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

type AuthPageProps = {
  mode: 'login' | 'signup' | 'password';
  title?: string;
  heading?: string;
  description?: string;
  step?: number;
  totalSteps?: number;
  onBack?: () => void;
  footer?: ReactNode;
  contentOffsetY?: number;
  children: ReactNode;
};

function Gradient({ dark = false }: { dark?: boolean }) {
  return (
    <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
      <Defs>
        <LinearGradient id={dark ? 'auth-dark' : 'auth-primary'} x1="0%" x2="100%" y1="0%" y2="0%">
          <Stop offset="0" stopColor={dark ? '#222227' : '#8D7AF8'} />
          <Stop offset="1" stopColor={dark ? '#30363A' : '#6551E9'} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${dark ? 'auth-dark' : 'auth-primary'})`} height="100%" width="100%" />
    </Svg>
  );
}

export function AuthPage({
  mode,
  title,
  heading,
  description,
  step,
  totalSteps = 4,
  onBack,
  footer,
  contentOffsetY = 0,
  children,
}: AuthPageProps) {
  const insets = useSafeAreaInsets();
  const isLogin = mode === 'login';
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={[styles.hero, { height: (isLogin ? 284 : 184) + insets.top }]}>
        <Gradient dark />
        {isLogin ? (
          <View style={[styles.loginBrand, { paddingTop: insets.top + 40 }]}>
            <LogoIcon height={68.479} width={71.5908} />
            <Text style={styles.logoName}>Auto-Fit</Text>
            <Text style={styles.loginTagline}>AI가 함께하는 나만의 헬스케어</Text>
            <Text style={styles.loginServices}>건강 기록 · 맞춤 식단 · 운동</Text>
          </View>
        ) : (
          <View style={[styles.headerInner, { paddingTop: insets.top + 16 }]}>
            <View style={styles.navigation}>
              <Pressable
                accessibilityLabel="뒤로 가기"
                accessibilityRole="button"
                hitSlop={10}
                onPress={onBack}
                style={styles.backButton}
              >
                <BackIcon height={24} width={24} />
              </Pressable>
              <Text style={styles.navigationTitle}>{title}</Text>
              <Text style={styles.stepCount}>{step ? `${step} / ${totalSteps}` : ''}</Text>
            </View>
            <Text style={styles.heading}>{heading}</Text>
            <Text style={styles.description}>{description}</Text>
            {step ? (
              <View accessibilityLabel={`${totalSteps}단계 중 ${step}단계`} style={styles.progress}>
                {Array.from({ length: totalSteps }, (_, index) => (
                  <View
                    key={index}
                    style={[styles.progressSegment, index < step && styles.progressActive]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footer ? 24 : 36, transform: [{ translateY: -contentOffsetY }] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={[styles.scroll, { marginTop: isLogin ? -20 : -24 }]}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function AuthCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const AuthTextField = forwardRef<TextInput, AppTextFieldProps>(
  function AuthTextField(props, ref) {
    return (
      <AppTextField
        {...props}
        ref={ref}
        fieldStyle={[styles.field, props.fieldStyle]}
        labelStyle={[styles.fieldLabel, props.labelStyle]}
        placeholderTextColor={colors.textSecondary}
        style={[styles.fieldInput, props.style]}
      />
    );
  },
);

export function AuthButton({
  title,
  onPress,
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {!disabled ? <Gradient /> : null}
      {loading ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <Text style={styles.buttonLabel}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    backgroundColor: colors.backgroundPurple,
    flex: 1,
    maxWidth: 412,
    width: '100%',
  },
  hero: { overflow: 'hidden', width: '100%' },
  loginBrand: { alignItems: 'center', gap: 8 },
  logoName: {
    color: colors.surface,
    fontFamily: fontFamilies.gmarketMedium,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 2,
  },
  loginTagline: {
    color: colors.textWhite,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  loginServices: {
    color: colors.primaryMedium,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  headerInner: { paddingHorizontal: 20 },
  navigation: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
    marginLeft: -12,
  },
  navigationTitle: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  stepCount: {
    color: colors.primaryMedium,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
    minWidth: 44,
    textAlign: 'right',
  },
  heading: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 24,
    lineHeight: 29,
    marginTop: 12,
  },
  description: {
    color: colors.textWhiteSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  progress: { flexDirection: 'row', gap: 6, marginTop: 14 },
  progressSegment: { backgroundColor: '#343B3F', borderRadius: 2, flex: 1, height: 4 },
  progressActive: { backgroundColor: colors.primaryMedium },
  scroll: {
    backgroundColor: colors.backgroundPurple,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
  },
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 24 },
  footer: { backgroundColor: colors.backgroundPurple, paddingHorizontal: 20, paddingTop: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  field: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
  },
  fieldLabel: {
    color: colors.dark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
  fieldInput: { fontSize: 15, lineHeight: 23 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  buttonDisabled: { backgroundColor: colors.border },
  buttonPressed: { opacity: 0.84 },
  buttonLabel: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
    lineHeight: 28,
  },
});
