import { Modal, Pressable, View } from 'react-native';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from './Text';

export function ConfirmDialog({
  visible,
  title,
  description,
  secondaryLabel,
  primaryLabel,
  onSecondary,
  onPrimary,
}: {
  visible: boolean;
  title: string;
  description: string;
  secondaryLabel: string;
  primaryLabel: string;
  onSecondary: () => void;
  onPrimary: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="fade" onRequestClose={onSecondary} transparent visible={visible}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onSecondary} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onPrimary} style={styles.primary}>
              <Text style={styles.primaryLabel}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(13, 13, 20, 0.45)',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    dialog: {
      backgroundColor: colors.background,
      borderRadius: 24,
      maxWidth: 360,
      padding: 24,
      width: '100%',
    },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
    secondary: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      flex: 1,
      height: 44,
      justifyContent: 'center',
    },
    secondaryLabel: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    primary: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      flex: 1,
      height: 44,
      justifyContent: 'center',
    },
    primaryLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 14 },
  } as const;
}
