import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useThemedStyles, type AppTheme } from '@/src/theme';

export interface IconButtonProps {
  icon: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: number;
  surface?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  size = 48,
  surface = false,
  style,
}: IconButtonProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: size, width: size },
        surface && styles.surface,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    base: {
      alignItems: 'center',
      borderRadius: radius.round,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 44,
    },
    surface: { backgroundColor: colors.elevated },
    disabled: { opacity: 0.4 },
    pressed: { backgroundColor: colors.surfaceMuted },
  } as const;
}
