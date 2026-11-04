import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { fontFamilies } from '@/src/theme';
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

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(13, 13, 20, 0.45)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxWidth: 360,
    padding: 24,
    width: '100%',
  },
  title: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
  description: { color: '#5E5D66', fontSize: 14, lineHeight: 21, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  secondary: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  secondaryLabel: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  primary: {
    alignItems: 'center',
    backgroundColor: '#5246C6',
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  primaryLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 14 },
});
