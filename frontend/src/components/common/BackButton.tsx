import BackIcon from '@/assets/icons/common/chevrons/Left.svg';
import { colors } from '@/src/theme';

import { IconButton, type IconButtonProps } from './IconButton';

export type BackButtonProps = Omit<IconButtonProps, 'accessibilityLabel' | 'icon'> & {
  accessibilityLabel?: string;
  color?: string;
};

export function BackButton({
  accessibilityLabel = '뒤로 가기',
  color = colors.textBody,
  ...props
}: BackButtonProps) {
  return (
    <IconButton
      accessibilityLabel={accessibilityLabel}
      icon={<BackIcon color={color} height={25} width={25} />}
      {...props}
    />
  );
}
