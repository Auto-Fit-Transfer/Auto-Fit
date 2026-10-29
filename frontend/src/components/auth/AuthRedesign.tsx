import { forwardRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Logo from '@/assets/brand/autofit-logo.svg';
import {
  AppButton,
  AppTextField,
  BackButton,
  type AppTextFieldProps,
  Text,
} from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Shared frame of the login, sign-up and password screens (Figma A2 · A3 · A5 · A6 · A7 · A8 · A9):
// white page, back button, a thin step bar, a large heading, and one main button at the bottom.

type AuthPageProps = {
  mode: 'login' | 'signup' | 'password';
  title?: string;
  heading?: string;
  description?: string;
  // Shown above the heading, such as the envelope on "메일을 보냈어요".
  topIcon?: ReactNode;
  step?: number;
  totalSteps?: number;
  onBack?: () => void;
  footer?: ReactNode;
  contentOffsetY?: number;
  children: ReactNode;
};

export function AuthPage({
  mode,
  title,
  heading,
  description,
  topIcon,
  step,
  totalSteps = 4,
  onBack,
  footer,
  contentOffsetY = 0,
  children,
}: AuthPageProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isLogin = mode === 'login';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {isLogin ? null : (
        <View style={{ paddingTop: insets.top }}>
          <View style={styles.topBar}>
            <BackButton onPress={onBack} />
            {title ? (
              <Text accessibilityRole="header" style={styles.screenName}>
                {title}
              </Text>
            ) : null}
          </View>
          {step ? (
            <View accessibilityLabel={`${totalSteps}단계 중 ${step}단계`} style={styles.progress}>
              {Array.from({ length: totalSteps }, (_, index) => (
                <View
                  key={index}
                  style={[styles.progressSegment, index < step && styles.progressDone]}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isLogin && { paddingTop: insets.top + 56 },
          { paddingBottom: footer ? 24 : 34, transform: [{ translateY: -contentOffsetY }] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLogin ? (
          <Logo color={colors.textPrimary} height={35} style={styles.logo} width={132} />
        ) : heading ? (
          <View style={styles.heading}>
            {topIcon ? <View style={styles.topIcon}>{topIcon}</View> : null}
            <Text accessibilityRole="header" style={styles.headingText}>
              {heading}
            </Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

// Groups fields; the redesign puts them straight on the page instead of in a card.
export function AuthCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.group, style]}>{children}</View>;
}

export const AuthTextField = forwardRef<TextInput, AppTextFieldProps>(
  function AuthTextField(props, ref) {
    return <AppTextField {...props} ref={ref} />;
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
  return <AppButton disabled={disabled} loading={loading} onPress={onPress} title={title} />;
}

function createStyles({ colors, text }: AppTheme) {
  return {
    root: {
      alignSelf: 'center',
      backgroundColor: colors.background,
      flex: 1,
      maxWidth: 412,
      width: '100%',
    },
    topBar: { alignItems: 'center', flexDirection: 'row', minHeight: 56, paddingHorizontal: 8 },
    screenName: { ...text.body1Strong, color: colors.textPrimary },
    progress: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 4 },
    progressSegment: { backgroundColor: colors.border, borderRadius: 3, flex: 1, height: 6 },
    progressDone: { backgroundColor: colors.textPrimary },
    content: { gap: 28, paddingHorizontal: 20, paddingTop: 24 },
    logo: { marginBottom: 12 },
    heading: { gap: 8 },
    topIcon: { marginBottom: 20 },
    headingText: { ...text.title1, color: colors.textPrimary },
    description: { ...text.body1, color: colors.textSecondary },
    group: { gap: 20 },
    footer: {
      backgroundColor: colors.background,
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
  } as const;
}
