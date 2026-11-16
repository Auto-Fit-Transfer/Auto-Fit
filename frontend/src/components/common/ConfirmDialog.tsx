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
  // Renewal A: a card with the dark outline, and two buttons on their ledges.
  const button = {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: 14,
    borderWidth: 2,
    flex: 1,
    height: 46,
    justifyContent: 'center',
  } as const;
  const label = { color: colors.ink, fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(22, 24, 46, 0.45)',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    dialog: {
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 22,
      borderWidth: 2,
      boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)',
      maxWidth: 360,
      paddingBottom: 26,
      paddingHorizontal: 20,
      paddingTop: 24,
      width: '100%',
    },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28, textAlign: 'center' },
    description: { ...label, color: colors.textBody, marginTop: 8, textAlign: 'center' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
    secondary: { ...button, backgroundColor: colors.surface, boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)' },
    secondaryLabel: label,
    primary: { ...button, backgroundColor: colors.primary, boxShadow: `0 4px 0 ${colors.ink}` },
    primaryLabel: { ...label, color: colors.onPrimary },
  } as const;
}
