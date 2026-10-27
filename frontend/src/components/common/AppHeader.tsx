import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '@/src/theme';

import { BackButton } from './BackButton';
import { Text } from './Text';

export interface AppHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AppHeader({
  title,
  showBackButton = true,
  onBackPress,
  rightAction,
  style,
}: AppHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.side}>
        {showBackButton ? <BackButton onPress={onBackPress} /> : null}
      </View>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  side: { alignItems: 'flex-start', justifyContent: 'center', width: 56 },
  right: { alignItems: 'flex-end' },
  title: { ...typography.sectionTitle, color: colors.textPrimary, flex: 1, textAlign: 'center' },
});
