import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// The Figma "Chip": a pill that is filled with the main color when chosen.
export function Chip({ label, selected = false, onPress, disabled = false, style }: ChipProps) {
  const { easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { minHeight: easyMode ? 46 : 40 },
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    chip: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    selected: { backgroundColor: colors.primary, borderColor: colors.primary },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.8 },
    label: { ...text.body2Strong, color: colors.textBody },
    selectedLabel: { color: colors.onPrimary },
  } as const;
}
