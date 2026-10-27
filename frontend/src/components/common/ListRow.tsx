import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '@/src/theme';

import { Text } from './Text';

export interface ListRowProps {
  title: string;
  description?: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  showDivider?: boolean;
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
  style,
}: ListRowProps) {
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
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {rightElement}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { flex: 1, gap: spacing.xs },
  title: { ...typography.body, color: colors.textPrimary },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
});
