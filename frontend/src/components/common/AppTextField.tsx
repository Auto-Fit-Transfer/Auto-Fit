import { forwardRef, useState, type ReactNode } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { radius, scaleForEasyMode, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

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

// The Figma "Input": label, a 52px field with a thin border, and a helper line.
function createStyles({ colors, text, easyMode }: AppTheme) {
  // TextInput is not the shared Text, so it is enlarged here for the easy mode.
  const inputText = easyMode ? scaleForEasyMode(text.body1) : text.body1;
  return {
    label: { ...text.body2Strong, color: colors.textPrimary, marginBottom: 8 },
    field: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      height: 52,
      paddingHorizontal: 16,
    },
    fieldEasy: { height: 60 },
    focused: { borderColor: colors.primary },
    error: { borderColor: colors.danger, borderWidth: 1.5 },
    disabled: { backgroundColor: colors.surfaceMuted },
    input: {
      ...inputText,
      color: colors.textPrimary,
      flex: 1,
      height: '100%',
      includeFontPadding: false,
      lineHeight: undefined,
      padding: 0,
    },
    disabledText: { color: colors.textDisabled },
    supporting: { ...text.body2, color: colors.textSecondary, marginTop: 8 },
    errorText: { color: colors.danger },
  } as const;
}
