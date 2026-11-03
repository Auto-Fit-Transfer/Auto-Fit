import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { radius, shadows, useThemedStyles, type AppTheme } from '@/src/theme';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface AppCardProps extends PropsWithChildren<ViewProps> {
  padding?: CardPadding;
  soft?: boolean;
  bordered?: boolean;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Written per side so a caller's paddingHorizontal or paddingVertical can still override it;
// "none" sets nothing, so a caller's own padding works as before.
const paddingStyles: Record<CardPadding, ViewStyle> = {
  none: {},
  sm: { paddingHorizontal: 8, paddingVertical: 8 },
  md: { paddingHorizontal: 16, paddingVertical: 16 },
  lg: { paddingHorizontal: 20, paddingVertical: 20 },
};

// The Figma box: light gray fill with a thin border (soft = a little darker, no border).
export function AppCard({
  children,
  padding = 'md',
  soft = false,
  bordered = !soft,
  shadow = false,
  style,
  ...viewProps
}: AppCardProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[
        styles.base,
        soft && styles.soft,
        bordered && styles.bordered,
        shadow && shadows.card,
        paddingStyles[padding],
        style,
      ]}
      {...viewProps}
    >
      {children}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    base: { backgroundColor: colors.surface, borderRadius: radius.card },
    soft: { backgroundColor: colors.surfaceMuted },
    bordered: { borderColor: colors.border, borderWidth: 1 },
  } as const;
}
