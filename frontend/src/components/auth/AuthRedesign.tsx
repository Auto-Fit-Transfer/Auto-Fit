import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import AutofitWordmarkDark from '@/assets/icons/autofit-wordmark-dark.svg';
import BackIcon from '@/assets/icons/common/chevrons/Left.svg';

import { AppTextField, type AppTextFieldProps, Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type AuthPageProps = {
  mode: 'login' | 'signup' | 'password';
  heading?: string;
  description?: string;
  step?: number;
  totalSteps?: number;
  onBack?: () => void;
  footer?: ReactNode;
  contentOffsetY?: number;
  children: ReactNode;
};

export function AuthPage({
  mode,
  heading,
  description,
  step,
  totalSteps = 5,
  onBack,
  footer,
  contentOffsetY = 0,
  children,
}: AuthPageProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const isLogin = mode === 'login';
  const Wordmark = isDark ? AutofitWordmarkDark : AutofitWordmark;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {isLogin ? (
        <View style={[styles.loginHeader, { paddingTop: insets.top + 56 }]}>
          <Wordmark accessibilityLabel="autofit" height={35} width={129} />
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.navigation}>
            <Pressable
              accessibilityLabel="뒤로 가기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onBack}
              style={styles.backButton}
            >
              <BackIcon color={colors.textPrimary} height={24} width={24} />
            </Pressable>
                      </View>
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
          {heading ? <Text style={styles.heading}>{heading}</Text> : null}
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isLogin && styles.loginContent,
          {
            paddingBottom: footer ? 18 : Math.max(insets.bottom + 34, 40),
            transform: [{ translateY: -contentOffsetY }],
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 34) }]}>
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
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

export const AuthTextField = forwardRef<TextInput, AppTextFieldProps>(
  function AuthTextField(props, ref) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>{title}</Text>
      )}
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 412, width: '100%' },
    loginHeader: { paddingHorizontal: 20 },
    header: { paddingHorizontal: 20 },
    navigation: { alignItems: 'center', flexDirection: 'row', height: 56 },
    backButton: { alignItems: 'flex-start', height: 44, justifyContent: 'center', marginLeft: -2, width: 40 },
    progress: { flexDirection: 'row', gap: 4, marginTop: 4 },
    progressSegment: { backgroundColor: colors.border, borderRadius: 3, flex: 1, height: 6 },
    progressActive: { backgroundColor: colors.tabBar },
    heading: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 22,
      lineHeight: 30,
      marginTop: 24,
    },
    description: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 8,
    },
    scroll: { flex: 1 },
    content: { flexGrow: 1, gap: 28, paddingHorizontal: 20, paddingTop: 28 },
    loginContent: { gap: 0, paddingHorizontal: 20, paddingTop: 40 },
    footer: { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 10 },
    card: { gap: 12 },
    field: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      height: 52,
      paddingHorizontal: 16,
    },
    fieldLabel: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 8,
    },
    fieldInput: {
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 24,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 56,
      justifyContent: 'center',
      width: '100%',
    },
    buttonDisabled: { backgroundColor: colors.surfaceMuted },
    buttonLabelDisabled: { color: colors.textDisabled },
    buttonPressed: { opacity: 0.85 },
    buttonLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  } as const;
}
