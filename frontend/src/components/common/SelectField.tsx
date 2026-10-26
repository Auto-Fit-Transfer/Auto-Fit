import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import DownIcon from '@/assets/icons/common/chevrons/Down.svg';
import { colors, radius, spacing, typography } from '@/src/theme';

export interface SelectFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  style?: StyleProp<ViewStyle>;
  fieldStyle?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  placeholderTextColor?: string;
  accessibilityLabel?: string;
}

export function SelectField({
  label,
  value,
  placeholder = '선택해주세요',
  onPress,
  leftElement,
  rightElement,
  disabled = false,
  error,
  helperText,
  style,
  fieldStyle,
  valueStyle,
  labelStyle,
  placeholderTextColor = colors.textDisabled,
  accessibilityLabel,
}: SelectFieldProps) {
  const supportingText = error ?? helperText;
  return (
    <View style={style}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: false }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.field,
          error && styles.error,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
          fieldStyle,
        ]}
      >
        {leftElement}
        <Text
          numberOfLines={1}
          style={[
            styles.value,
            !value && styles.placeholder,
            !value && { color: placeholderTextColor },
            disabled && styles.disabledText,
            valueStyle,
          ]}
        >
          {value ?? placeholder}
        </Text>
        {rightElement ?? (
          <DownIcon
            color={disabled ? colors.textDisabled : colors.textSecondary}
            height={20}
            width={20}
          />
        )}
      </Pressable>
      {supportingText ? (
        <Text style={[styles.supporting, error && styles.errorText]}>{supportingText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.textBody, marginBottom: spacing.sm },
  field: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    height: 55,
    paddingHorizontal: spacing.lg,
  },
  error: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.background },
  pressed: { borderColor: colors.primary },
  value: { ...typography.body, color: colors.textPrimary, flex: 1 },
  placeholder: { color: colors.textDisabled },
  disabledText: { color: colors.textDisabled },
  supporting: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  errorText: { color: colors.danger },
});
