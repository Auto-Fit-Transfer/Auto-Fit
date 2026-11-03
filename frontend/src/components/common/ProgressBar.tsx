import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useThemedStyles, type AppTheme } from '@/src/theme';

export interface ProgressBarProps {
  // 0 to 1
  value: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

// Every gauge in the redesign uses one color on a visible gray track.
export function ProgressBar({ value, height = 8, style }: ProgressBarProps) {
  const styles = useThemedStyles(createStyles);
  const ratio = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(ratio * 100) }}
      style={[styles.track, { height }, style]}
    >
      <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    track: { backgroundColor: colors.gaugeTrack, borderRadius: radius.round, overflow: 'hidden' },
    fill: { backgroundColor: colors.gaugeFill, borderRadius: radius.round, height: '100%' },
  } as const;
}
