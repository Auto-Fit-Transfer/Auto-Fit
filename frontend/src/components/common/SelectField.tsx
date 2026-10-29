import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import DownIcon from '@/assets/icons/common/chevrons/Down.svg';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

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
  placeholderTextColor,
  accessibilityLabel,
}: SelectFieldProps) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
          easyMode && styles.fieldEasy,
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
            !value && { color: placeholderTextColor ?? colors.textSecondary },
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

function createStyles({ colors, text }: AppTheme) {
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
    error: { borderColor: colors.danger, borderWidth: 1.5 },
    disabled: { backgroundColor: colors.surfaceMuted },
    pressed: { borderColor: colors.primary },
    value: { ...text.body1, color: colors.textPrimary, flex: 1 },
    placeholder: { color: colors.textSecondary },
    disabledText: { color: colors.textDisabled },
    supporting: { ...text.body2, color: colors.textSecondary, marginTop: 8 },
    errorText: { color: colors.danger },
  } as const;
}
