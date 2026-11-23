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
  busy = false,
}: {
  visible: boolean;
  title: string;
  description: string;
  secondaryLabel: string;
  primaryLabel: string;
  onSecondary: () => void;
  onPrimary: () => void;
  busy?: boolean; // the primary action is running: neither button nor closing the dialog does anything
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="fade" onRequestClose={busy ? () => undefined : onSecondary} transparent visible={visible}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onSecondary} style={[styles.secondary, busy && styles.busy]}>
              <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPrimary} style={styles.primary}>
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
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
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
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      maxWidth: 360,
      paddingBottom: 26,
      paddingHorizontal: 20,
      paddingTop: 24,
      width: '100%',
    },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28, textAlign: 'center' },
    description: { ...label, color: colors.textBody, marginTop: 8, textAlign: 'center' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
    secondary: { ...button, backgroundColor: colors.surface, },
    busy: { opacity: 0.4 },
    secondaryLabel: label,
    primary: { ...button, backgroundColor: colors.primary, },
    primaryLabel: { ...label, color: colors.onPrimary },
  } as const;
}
