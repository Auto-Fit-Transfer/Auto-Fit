import BackIcon from '@/assets/icons/ui/caret-left.svg';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { IconButton, type IconButtonProps } from './IconButton';

export type BackButtonProps = Omit<IconButtonProps, 'accessibilityLabel' | 'icon'> & {
  accessibilityLabel?: string;
  color?: string;
};

export function BackButton({ accessibilityLabel = '뒤로 가기', color, ...props }: BackButtonProps) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const iconSize = easyMode ? 28 : 24;
  return (
    <IconButton
      accessibilityLabel={accessibilityLabel}
      icon={<BackIcon color={color ?? colors.ink} height={iconSize} width={iconSize} />}
      size={44}
      {...props}
      style={[styles.card, props.style]}
    />
  );
}

// Renewal A: the way back is a small outlined card on a ledge.
function createStyles({ colors }: AppTheme) {
  return {
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: `0 4px 0 ${colors.ink}`,
    },
  } as const;
}
