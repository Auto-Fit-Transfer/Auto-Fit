import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export type AppButtonVariant =
  'primary' | 'secondary' | 'text' | 'danger' | 'outline' | 'dangerOutline';

// L 56 · M 44 · S 34 as in the Figma "Button" set; the easy mode makes each a bit taller.
export type AppButtonSize = 'L' | 'M' | 'S';

const heights: Record<AppButtonSize, [normal: number, easy: number]> = {
  L: [56, 64],
  M: [44, 52],
  S: [34, 40],
};

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  size,
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  style,
  labelStyle,
  accessibilityLabel,
}: AppButtonProps) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isOutline = variant === 'outline' || variant === 'dangerOutline';
  const buttonSize = size ?? (isOutline ? 'S' : 'L');
  const isUnavailable = disabled || loading;
  const filled = variant === 'primary' || variant === 'secondary';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isUnavailable }}
      disabled={isUnavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        buttonSize === 'S' ? styles.small : buttonSize === 'M' ? styles.medium : styles.large,
        { height: heights[buttonSize][easyMode ? 1 : 0] },
        fullWidth && styles.fullWidth,
        styles[variant],
        disabled && filled && styles.disabledFill,
        pressed && !isUnavailable && styles.pressed,
        pressed && !isUnavailable && variant === 'primary' && styles.primaryPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              buttonSize === 'L' ? styles.labelLarge : styles.labelSmall,
              styles[`${variant}Label`],
              disabled && styles.disabledLabel,
              labelStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    base: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
    },
    large: { borderRadius: radius.button, paddingHorizontal: 24 },
    medium: { borderRadius: radius.button, paddingHorizontal: 16 },
    small: { borderRadius: radius.buttonSmall, paddingHorizontal: 12 },
    fullWidth: { alignSelf: 'stretch' },
    primary: { backgroundColor: colors.primary },
    primaryPressed: { backgroundColor: colors.primaryPressed },
    secondary: { backgroundColor: colors.surfaceMuted },
    text: {},
    danger: {},
    outline: { backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1 },
    dangerOutline: { backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1 },
    disabledFill: { backgroundColor: colors.surfaceMuted },
    pressed: { opacity: 0.85 },
    labelLarge: { ...text.button, includeFontPadding: false },
    labelSmall: { ...text.body2Strong, includeFontPadding: false },
    primaryLabel: { color: colors.onPrimary },
    secondaryLabel: { color: colors.textPrimary },
    textLabel: { color: colors.textPrimary },
    dangerLabel: { color: colors.danger },
    outlineLabel: { color: colors.textPrimary },
    dangerOutlineLabel: { color: colors.danger },
    disabledLabel: { color: colors.textDisabled },
  } as const;
}
