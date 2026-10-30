import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fontFamilies } from '@/src/theme';

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
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 25,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxWidth: 360,
    padding: 19,
    width: '100%',
  },
  title: { color: '#222227', fontFamily: fontFamilies.pretendardBold, fontSize: 17 },
  description: { color: '#777780', fontSize: 12, lineHeight: 18, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 21 },
  secondary: {
    alignItems: 'center',
    backgroundColor: '#F2F2F4',
    borderRadius: 8,
    flex: 1,
    height: 39,
    justifyContent: 'center',
  },
  secondaryLabel: { color: '#66666F', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  primary: {
    alignItems: 'center',
    backgroundColor: '#503DD7',
    borderRadius: 8,
    flex: 1,
    height: 39,
    justifyContent: 'center',
  },
  primaryLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
});
