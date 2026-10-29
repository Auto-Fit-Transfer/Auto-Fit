import BackIcon from '@/assets/icons/ui/caret-left.svg';
import { useAppTheme } from '@/src/theme';

import { IconButton, type IconButtonProps } from './IconButton';

export type BackButtonProps = Omit<IconButtonProps, 'accessibilityLabel' | 'icon'> & {
  accessibilityLabel?: string;
  color?: string;
};

export function BackButton({ accessibilityLabel = '뒤로 가기', color, ...props }: BackButtonProps) {
  const { colors, easyMode } = useAppTheme();
  const iconSize = easyMode ? 28 : 24;
  return (
    <IconButton
      accessibilityLabel={accessibilityLabel}
      icon={<BackIcon color={color ?? colors.textPrimary} height={iconSize} width={iconSize} />}
      size={44}
      {...props}
    />
  );
}
