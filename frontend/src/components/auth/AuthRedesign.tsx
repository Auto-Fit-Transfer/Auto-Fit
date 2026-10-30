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
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTextField, type AppTextFieldProps } from '@/src/components/common';
import { fontFamilies } from '@/src/theme';

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

export function AuthPage({
  mode,
  title,
  heading,
  description,
  step,
  totalSteps = 5,
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
      <StatusBar style="dark" />
      {isLogin ? (
        <View style={[styles.loginHeader, { paddingTop: insets.top + 37 }]}>
          <Text accessibilityLabel="autofit" style={styles.wordmark}>
            auto<Text style={styles.wordmarkAccent}>fit</Text>
          </Text>
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
              <Text style={styles.backSymbol}>‹</Text>
            </Pressable>
            {mode === 'password' ? <Text style={styles.navigationTitle}>{title}</Text> : null}
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
            paddingBottom: footer ? 18 : Math.max(insets.bottom + 30, 40),
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
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
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
        placeholderTextColor="#9B9BA4"
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
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.buttonLabel}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', backgroundColor: '#FFFFFF', flex: 1, maxWidth: 412, width: '100%' },
  loginHeader: { minHeight: 100, paddingHorizontal: 24 },
  wordmark: {
    color: '#17171B',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 34,
    letterSpacing: -1.7,
  },
  wordmarkAccent: { color: '#503DD7' },
  header: { paddingHorizontal: 20 },
  navigation: { alignItems: 'center', flexDirection: 'row', height: 42 },
  backButton: { alignItems: 'flex-start', height: 42, justifyContent: 'center', width: 40 },
  backSymbol: { color: '#222227', fontSize: 32, lineHeight: 36 },
  navigationTitle: {
    color: '#222227',
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    marginRight: 40,
    textAlign: 'center',
  },
  progress: { flexDirection: 'row', gap: 5, marginTop: 7 },
  progressSegment: { backgroundColor: '#E5E5EA', borderRadius: 2, flex: 1, height: 3 },
  progressActive: { backgroundColor: '#222227' },
  heading: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 23,
    lineHeight: 30,
    marginTop: 24,
  },
  description: {
    color: '#777780',
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  scroll: { flex: 1 },
  content: { flexGrow: 1, gap: 18, paddingHorizontal: 20, paddingTop: 20 },
  loginContent: { paddingHorizontal: 24, paddingTop: 9 },
  footer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10 },
  card: { gap: 12 },
  field: {
    backgroundColor: '#F9F9FB',
    borderColor: '#E6E6ED',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
  },
  fieldLabel: {
    color: '#333339',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  fieldInput: {
    color: '#222227',
    fontSize: Platform.OS === 'web' ? 16 : 14,
    lineHeight: Platform.OS === 'web' ? 22 : 21,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#503DD7',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    width: '100%',
  },
  buttonDisabled: { backgroundColor: '#EDEDF1' },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
});
