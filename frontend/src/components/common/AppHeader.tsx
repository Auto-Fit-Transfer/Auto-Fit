import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { BackButton } from './BackButton';
import { Text } from './Text';

export interface AppHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// The Figma top bar: back · centered title · one action. In the easy mode the title moves next
// to the back button so long titles keep their room.
export function AppHeader({
  title,
  showBackButton = true,
  onBackPress,
  rightAction,
  style,
}: AppHeaderProps) {
  const { easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.side, easyMode && !showBackButton && styles.collapsed]}>
        {showBackButton ? <BackButton onPress={onBackPress} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.title, easyMode && styles.titleStart]}>
        {title}
      </Text>
      <View style={[styles.side, styles.right, easyMode && styles.sideAuto]}>{rightAction}</View>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    container: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flexDirection: 'row',
      minHeight: 56,
      paddingHorizontal: 8,
    },
    side: { alignItems: 'flex-start', justifyContent: 'center', minWidth: 44, width: 44 },
    collapsed: { minWidth: 12, width: 12 },
    sideAuto: { width: 'auto' },
    right: { alignItems: 'flex-end' },
    title: { ...text.body1Strong, color: colors.textPrimary, flex: 1, textAlign: 'center' },
    titleStart: { textAlign: 'left' },
  } as const;
}
