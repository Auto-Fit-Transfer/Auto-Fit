import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '@/src/theme';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, rightAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  content: { flex: 1, gap: spacing.xs },
  title: { ...typography.sectionTitle, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
});
