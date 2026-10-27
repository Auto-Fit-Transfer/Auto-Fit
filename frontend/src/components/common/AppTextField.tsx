import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/src/theme';

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
    placeholderTextColor = colors.textNavigator,
    style,
    ...textInputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const supportingText = error ?? helperText;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
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
          placeholderTextColor={placeholderTextColor}
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

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.textBody, marginBottom: spacing.sm },
  field: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 55,
    paddingHorizontal: 10,
  },
  focused: { borderColor: colors.primary },
  error: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.background },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    height: '100%',
    includeFontPadding: false,
    lineHeight: 17,
    padding: 0,
  },
  disabledText: { color: colors.textDisabled },
  supporting: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  errorText: { color: colors.danger },
});
