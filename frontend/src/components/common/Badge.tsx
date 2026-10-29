import type { ComponentType } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import CheckIcon from '@/assets/icons/ui/check.svg';
import InfoIcon from '@/assets/icons/ui/info.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export type BadgeTone = 'good' | 'caution' | 'danger' | 'neutral';

const icons: Record<BadgeTone, ComponentType<SvgProps>> = {
  good: CheckIcon,
  caution: InfoIcon,
  danger: WarningIcon,
  neutral: InfoIcon,
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  showIcon?: boolean;
  style?: StyleProp<ViewStyle>;
}

// The Figma "Badge": a small status pill (좋아요 · 주의 · 위험 · 보통).
export function Badge({ label, tone = 'neutral', showIcon = true, style }: BadgeProps) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const Icon = icons[tone];
  const color = {
    good: colors.success,
    caution: colors.warning,
    danger: colors.danger,
    neutral: colors.textSecondary,
  }[tone];
  const iconSize = easyMode ? 16 : 14;
  return (
    <View style={[styles.badge, styles[tone], style]}>
      {showIcon ? <Icon color={color} height={iconSize} width={iconSize} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    badge: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: radius.round,
      flexDirection: 'row',
      gap: 4,
      minHeight: 26,
      paddingHorizontal: 8,
    },
    good: { backgroundColor: colors.successLight },
    caution: { backgroundColor: colors.warningLight },
    danger: { backgroundColor: colors.dangerLight },
    neutral: { backgroundColor: colors.surfaceMuted },
    label: { ...text.captionStrong },
  } as const;
}
