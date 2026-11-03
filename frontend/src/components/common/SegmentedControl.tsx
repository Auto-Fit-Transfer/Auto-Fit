import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

// The Figma "Segmented": a gray track with the chosen tab raised in white.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityRole="tablist" style={[styles.track, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, { minHeight: easyMode ? 44 : 36 }, selected && styles.selected]}
          >
            <Text style={selected ? styles.selectedLabel : styles.label}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    track: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.round,
      flexDirection: 'row',
      padding: 4,
    },
    segment: {
      alignItems: 'center',
      borderRadius: radius.round,
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    selected: { backgroundColor: colors.elevated },
    label: { ...text.body2, color: colors.textSecondary },
    selectedLabel: { ...text.body2Strong, color: colors.textPrimary },
  } as const;
}
