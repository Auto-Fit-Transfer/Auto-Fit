import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/src/theme';

import { Text } from './Text';

export type AppButtonVariant = 'primary' | 'secondary';

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: AppButtonVariant;
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
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  style,
  labelStyle,
  accessibilityLabel,
}: AppButtonProps) {
  const isUnavailable = disabled || loading;
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isUnavailable }}
      disabled={isUnavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        isSecondary ? styles.secondary : styles.primary,
        isUnavailable && styles.disabled,
        pressed && !isUnavailable && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.primary : colors.surface} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.label,
              isSecondary && styles.secondaryLabel,
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

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 55,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.primaryMedium, borderColor: colors.primaryMedium },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary },
  label: {
    ...typography.button,
    color: colors.surface,
    includeFontPadding: false,
    lineHeight: 19,
  },
  secondaryLabel: { color: colors.primaryDark },
  disabled: { backgroundColor: colors.border, borderColor: colors.border },
  disabledLabel: { color: colors.textDisabled },
  pressed: { opacity: 0.82 },
});
