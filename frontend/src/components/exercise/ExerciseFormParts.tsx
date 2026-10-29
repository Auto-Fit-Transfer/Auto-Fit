import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Chip, Text } from '@/src/components/common';
import { radius, useThemedStyles, type AppTheme } from '@/src/theme';

// A titled group of choices, as in the Figma exercise screens (E1 · E6 · E12).
export function ChoiceSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {aside ? <Text style={styles.aside}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Wrapping pill choices; `selected` decides which ones are filled.
export function ChoiceChips<T extends string | number>({
  options,
  isSelected,
  onSelect,
}: {
  options: readonly { value: T; label: string }[];
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Chip
          key={String(option.value)}
          label={option.label}
          onPress={() => onSelect(option.value)}
          selected={isSelected(option.value)}
        />
      ))}
    </View>
  );
}

// Gray box with a thin border, the card used across the redesign.
export function SurfaceCard({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, { gap }]}>{children}</View>;
}

function createStyles({ colors, text }: AppTheme) {
  return {
    section: { gap: 12 },
    titleRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    title: { ...text.body1Strong, color: colors.textPrimary },
    aside: { ...text.caption, color: colors.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      padding: 16,
    },
  } as const;
}
