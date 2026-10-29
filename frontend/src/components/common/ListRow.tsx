import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export interface ListRowProps {
  title: string;
  description?: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  showDivider?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  title,
  description,
  leftElement,
  rightElement,
  onPress,
  disabled = false,
  showDivider = false,
  danger = false,
  style,
}: ListRowProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ disabled }}
      disabled={!onPress || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.divider,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {leftElement}
      <View style={styles.content}>
        <Text style={[styles.title, danger && styles.danger]}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {rightElement}
    </Pressable>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: 64,
      paddingVertical: 12,
    },
    divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
    content: { flex: 1, gap: 2 },
    title: { ...text.body1, color: colors.textPrimary },
    danger: { color: colors.danger },
    description: { ...text.body2, color: colors.textSecondary },
    pressed: { opacity: 0.65 },
    disabled: { opacity: 0.4 },
  } as const;
}
