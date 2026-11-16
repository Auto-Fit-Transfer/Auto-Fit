import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aForm } from '@/src/components/a/form';
import { JoinScene } from '@/src/components/a/JoinScene';
import BackIcon from '@/assets/icons/common/chevrons/Left.svg';

import { AppTextField, type AppTextFieldProps, Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type AuthPageProps = {
  mode: 'login' | 'signup' | 'password';
  heading?: string;
  // Renewal A: the name on the bar when the heading below it is the step's question (캐릭터 만들기).
  barTitle?: string;
  // The picture above what the screen asks (the street and my character).
  scene?: ReactNode;
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
  barTitle,
  scene,
  description,
  step,
  totalSteps = 5,
  onBack,
  footer,
  contentOffsetY = 0,
  children,
}: AuthPageProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const isLogin = mode === 'login';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {isLogin ? (
        // Renewal A: signing in is the game's title screen - the street, my character on it, and the name.
        // The street takes the height the form below leaves, so the screen has no empty half.
        <JoinScene bigFrom={440} style={[styles.title, { minHeight: 300 + insets.top }]} tier={1}>
          <Text accessibilityRole="header" style={[styles.titleName, { top: insets.top + 44 }]}>Auto-Fit</Text>
        </JoinScene>
      ) : (
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.navigation}>
            <Pressable
              accessibilityLabel="뒤로 가기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
            >
              <BackIcon color={colors.ink} height={24} width={24} />
            </Pressable>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.barTitle}>
              {barTitle ?? heading}
            </Text>
            {step ? (
              <View accessible accessibilityLabel={`${totalSteps}단계 중 ${step}단계`} style={styles.progress}>
                {Array.from({ length: totalSteps }, (_, index) => (
                  <View
                    key={index}
                    style={[styles.progressSegment, index < step && styles.progressActive]}
                  />
                ))}
              </View>
            ) : null}
          </View>
          {barTitle && heading ? <Text style={styles.heading}>{heading}</Text> : null}
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
        style={isLogin ? styles.loginScroll : styles.scroll}
      >
        {scene}
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
        <ActivityIndicator color="#1B1247" />
      ) : (
        <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>{title}</Text>
      )}
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 412, width: '100%' },
    title: { borderRadius: 0, borderWidth: 0 },
    titleName: {
      color: '#FFFFFF',
      fontFamily: fontFamilies.galmuri11Bold,
      fontSize: 44,
      left: 0,
      lineHeight: 50,
      position: 'absolute',
      right: 0,
      textAlign: 'center',
      textShadowColor: colors.ink,
      textShadowOffset: { height: 3, width: 3 },
      textShadowRadius: 2,
    },
    // Renewal A: the bar is the way back on its ledge, the name in pixel letters and one dot per step.
    header: { paddingHorizontal: 16 },
    navigation: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 52 },
    backButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: `0 4px 0 ${colors.ink}`,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    backPressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 4 }] },
    barTitle: { color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    progress: { flexDirection: 'row', gap: 3 },
    progressSegment: {
      backgroundColor: colors.track,
      borderColor: 'rgba(32, 35, 63, 0.25)',
      borderWidth: 1,
      height: 8,
      width: 8,
    },
    progressActive: { backgroundColor: colors.primary, borderColor: colors.ink },
    heading: {
      color: colors.ink,
      fontFamily: fontFamilies.galmuri11Bold,
      fontSize: 24,
      lineHeight: 28,
      marginTop: 10,
    },
    description: { ...a.p15, color: colors.textBody, marginTop: 8 },
    scroll: { flex: 1 },
    loginScroll: { flexGrow: 0 },
    content: { flexGrow: 1, gap: 14, paddingHorizontal: 16, paddingTop: 12 },
    loginContent: { gap: 0, paddingHorizontal: 16, paddingTop: 20 },
    footer: { backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 10 },
    card: { gap: 12 },
    field: a.field,
    fieldLabel: a.q,
    fieldInput: a.input,
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      // Renewal A: the dark outline and the ledge that goes down when pressed, as on every button.
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: `0 4px 0 ${colors.ink}`,
      height: 56,
      justifyContent: 'center',
      width: '100%',
    },
    buttonDisabled: { backgroundColor: colors.surfaceMuted },
    buttonLabelDisabled: { color: colors.textDisabled },
    buttonPressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 4 }] },
    buttonLabel: { color: colors.onPrimary, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
  } as const;
}
