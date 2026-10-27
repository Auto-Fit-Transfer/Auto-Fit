import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet, Text } from '@/src/components/common';
import { colors, fontFamilies, spacing } from '@/src/theme';

export type CommunityOption = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export interface CommunityOptionsSheetProps {
  visible: boolean;
  title?: string;
  options: CommunityOption[];
  onClose: () => void;
}

export function CommunityOptionsSheet({
  visible,
  title,
  options,
  onClose,
}: CommunityOptionsSheetProps) {
  return (
    <AppBottomSheet onClose={onClose} title={title} visible={visible}>
      <View style={styles.list}>
        {options.map((option) => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              // iOS cannot present a new modal while this one is still closing.
              setTimeout(option.onPress, 300);
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={[styles.label, option.destructive && styles.destructive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.sm },
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xs,
  },
  pressed: { backgroundColor: colors.primaryLight },
  label: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 16 },
  destructive: { color: colors.danger },
});
