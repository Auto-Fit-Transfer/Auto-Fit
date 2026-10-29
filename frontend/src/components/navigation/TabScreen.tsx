import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from './BottomNavigation';

export interface TabScreenProps extends PropsWithChildren {
  // Left side of the 56px top row: a title, or something else such as the logo.
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
  // Content between the top row and the scrolling body that should not scroll.
  fixedTop?: ReactNode;
  refreshControl?: ScrollViewProps['refreshControl'];
  gap?: number;
}

// Frame shared by the five tab screens: top row, scrolling body, room for the floating tab bar.
export function TabScreen({
  title,
  left,
  right,
  fixedTop,
  refreshControl,
  gap = 16,
  children,
}: TabScreenProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const bottomClearance =
    getBottomNavigationVisualHeight(height) +
    (easyMode ? 8 : 0) +
    Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP) +
    24;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {left ?? (title ? <Text style={styles.title}>{title}</Text> : <View />)}
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {fixedTop}
      <ScrollView
        contentContainerStyle={[styles.body, { gap, paddingBottom: bottomClearance }]}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    screen: { backgroundColor: colors.background, flex: 1 },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingLeft: 20,
      paddingRight: 8,
    },
    title: { ...text.title1, color: colors.textPrimary },
    right: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    body: { paddingHorizontal: 20, paddingTop: 12 },
  } as const;
}
