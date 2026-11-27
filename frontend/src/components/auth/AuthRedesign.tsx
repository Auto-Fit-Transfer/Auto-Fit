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
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
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
  // Renewal B's lilac-marked headline in place of the plain heading, and the button right under what is
  // asked instead of pinned to the foot of the screen (11/27, the sign-up side paths)
  headline?: ReactNode;
  inlineFooter?: boolean;
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
  headline,
  inlineFooter = false,
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
        // Renewal B (b-start.html #vLogin): the way back to the first screen, then the app's black card asks
        // me to sign in, the form under it, all one block a little above the middle.
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.navigation}>
            {onBack ? (
              <Pressable accessibilityLabel="처음으로" accessibilityRole="button" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}>
                <BackIcon color={colors.textPrimary} height={24} width={24} />
              </Pressable>
            ) : null}
          </View>
        </View>
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
              <BackIcon color={colors.textPrimary} height={24} width={24} />
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
          {headline ? <View style={styles.headline}>{headline}</View> : barTitle && heading ? <Text style={styles.heading}>{heading}</Text> : null}
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isLogin && styles.loginContent,
          {
            paddingBottom: footer && !inlineFooter ? 18 : Math.max(insets.bottom + 34, 40),
            transform: [{ translateY: -contentOffsetY }],
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={isLogin ? styles.loginScroll : styles.scroll}
      >
        {isLogin ? (
          <View style={styles.ai}>
            <ChatCharacterAvatar characterId="quni" size={44} />
            <View style={styles.aiCopy}>
              <Text style={styles.aiName}>다시 오셨네요</Text>
              <Text accessibilityRole="header" style={styles.aiTitle}>로그인해 주세요</Text>
            </View>
          </View>
        ) : null}
        {scene}
        {children}
        {footer && inlineFooter ? <View style={styles.inlineFooter}>{footer}</View> : null}
      </ScrollView>
      {footer && !inlineFooter ? (
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
    ai: { alignItems: 'center', backgroundColor: colors.aiCard, borderRadius: 28, flexDirection: 'row', gap: 12, marginBottom: 14, padding: 20 },
    aiCopy: { flex: 1, minWidth: 0 },
    aiName: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    // Renewal B: the way back as a round white button, the name bold, one round dot per step.
    header: { paddingHorizontal: 20 },
    navigation: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 52 },
    backButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    backPressed: { opacity: 0.85 },
    barTitle: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 22 },
    progress: { flexDirection: 'row', gap: 5 },
    progressSegment: { backgroundColor: colors.surfaceMuted, borderRadius: 4, height: 8, width: 8 },
    progressActive: { backgroundColor: colors.primary },
    heading: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardExtraBold,
      fontSize: 30,
      letterSpacing: -0.6,
      lineHeight: 38,
      marginTop: 10,
    },
    description: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 22, marginTop: 8 },
    headline: { marginTop: 10 },
    inlineFooter: { marginTop: 2 },
    scroll: { flex: 1 },
    loginScroll: { flex: 1 },
    content: { flexGrow: 1, gap: 14, paddingHorizontal: 20, paddingTop: 12 },
    loginContent: { gap: 0, justifyContent: 'center', paddingBottom: '18%', paddingHorizontal: 20, paddingTop: 0 },
    footer: { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 10 },
    card: { gap: 12 },
    field: a.field,
    fieldLabel: a.q,
    fieldInput: a.input,
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      // Renewal B: the black pill.
      borderRadius: 999,
      height: 56,
      justifyContent: 'center',
      width: '100%',
    },
    buttonDisabled: { backgroundColor: colors.surfaceMuted },
    buttonLabelDisabled: { color: colors.textDisabled },
    buttonPressed: { opacity: 0.85 },
    buttonLabel: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
  } as const;
}
