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
  // Renewal B: a white card without an outline, two pill buttons (the light one, the black one).
  const button = {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    height: 50,
    justifyContent: 'center',
  } as const;
  const label = { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 } as const;
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(1, 1, 1, 0.45)',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    dialog: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      maxWidth: 360,
      paddingBottom: 26,
      paddingHorizontal: 20,
      paddingTop: 24,
      width: '100%',
    },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 20, lineHeight: 28, textAlign: 'center' },
    description: { ...label, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 14.5, lineHeight: 22, marginTop: 8, textAlign: 'center' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
    secondary: { ...button, backgroundColor: colors.surfaceMuted },
    busy: { opacity: 0.4 },
    secondaryLabel: label,
    primary: { ...button, backgroundColor: colors.primary },
    primaryLabel: { ...label, color: colors.onPrimary },
  } as const;
}
