import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, rightAction, style }: SectionHeaderProps) {
  const styles = useThemedStyles(createStyles);
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

function createStyles({ colors, text }: AppTheme) {
  return {
    container: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    content: { flex: 1, gap: 2 },
    title: { ...text.body1Strong, color: colors.textPrimary },
    subtitle: { ...text.body2, color: colors.textSecondary },
  } as const;
}
