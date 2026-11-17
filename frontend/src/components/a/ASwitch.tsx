import { Pressable, View } from 'react-native';

import { useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal A's switch: an outlined pill, violet when on, with a white knob in the same outline.
export function ASwitch({ label, value, disabled = false, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onChange}
      style={[styles.track, value && styles.on, disabled && styles.unavailable]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    track: { backgroundColor: colors.track, borderColor: colors.ink, borderRadius: 99, borderWidth: 2, height: 28, width: 48 },
    on: { backgroundColor: colors.primary },
    unavailable: { opacity: 0.5 },
    knob: { backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 10, borderWidth: 2, height: 20, left: 2, position: 'absolute', top: 2, width: 20 },
    knobOn: { left: 22 },
  } as const;
}
