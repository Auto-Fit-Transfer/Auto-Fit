import { forwardRef, useState, type ReactNode } from 'react';
import {
  Platform,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

// The field border already shows focus, so the browser's own focus ring is turned off on the web.
// React Native's types leave out 'none', which react-native-web accepts.
export const noWebFocusRing: TextStyle =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : {};

export interface AppTextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  fieldStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export const AppTextField = forwardRef<TextInput, AppTextFieldProps>(function AppTextField(
  {
    label,
    error,
    helperText,
    disabled = false,
    leftElement,
    rightElement,
    containerStyle,
    fieldStyle,
    labelStyle,
    onFocus,
    onBlur,
    placeholderTextColor,
    style,
    ...textInputProps
  },
  ref,
) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const supportingText = error ?? helperText;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          easyMode && styles.fieldEasy,
          focused && styles.focused,
          error && styles.error,
          disabled && styles.disabled,
          fieldStyle,
        ]}
      >
        {leftElement}
        <TextInput
          ref={ref}
          lineBreakStrategyIOS="hangul-word"
          {...textInputProps}
          accessibilityLabel={textInputProps.accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          editable={!disabled}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
          style={[styles.input, disabled && styles.disabledText, style]}
        />
        {rightElement}
      </View>
      {supportingText ? (
        <Text
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          style={[styles.supporting, error && styles.errorText]}
        >
          {supportingText}
        </Text>
      ) : null}
    </View>
  );
});

// Renewal A: a small name above, a white box with the dark outline, pixel letters in it.
function createStyles({ colors }: AppTheme) {
  const small = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  return {
    label: { ...small, color: colors.textSecondary, marginBottom: 8 },
    field: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 12,
      borderWidth: 2,
      flexDirection: 'row',
      gap: 8,
      height: 48,
      paddingHorizontal: 12,
    },
    fieldEasy: { height: 56 },
    focused: {},
    error: { borderColor: colors.danger },
    disabled: { backgroundColor: colors.surfaceMuted },
    input: {
      color: colors.ink,
      flex: 1,
      fontFamily: fontFamilies.galmuri14,
      fontSize: 15,
      height: '100%',
      includeFontPadding: false,
      // Lets a narrow field shrink the input so a unit on the right stays visible.
      minWidth: 0,
      padding: 0,
      ...noWebFocusRing,
    },
    disabledText: { color: colors.textDisabled },
    supporting: { ...small, color: colors.textSecondary, marginTop: 8 },
    errorText: { color: colors.danger },
  } as const;
}
