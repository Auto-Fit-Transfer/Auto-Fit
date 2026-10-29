import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { radius, useThemedStyles, type AppTheme } from '@/src/theme';

import { AppButton } from './AppButton';
import { Text } from './Text';

export interface AppDialogProps extends PropsWithChildren {
  visible: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function AppDialog({
  visible,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
  destructive = false,
  children,
}: AppDialogProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="대화상자 닫기"
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
            {children}
          </View>
          <View style={styles.actions}>
            <AppButton
              fullWidth={false}
              onPress={onCancel}
              size="M"
              style={styles.action}
              title={cancelText}
              variant="secondary"
            />
            {destructive ? (
              <Pressable
                accessibilityRole="button"
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.action,
                  styles.destructiveAction,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.destructiveLabel}>{confirmText}</Text>
              </Pressable>
            ) : (
              <AppButton
                fullWidth={false}
                onPress={onConfirm}
                size="M"
                style={styles.action}
                title={confirmText}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// The Figma "Dialog": white card with 24px corners, title, short body, two buttons.
function createStyles({ colors, text }: AppTheme) {
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
    dialog: {
      backgroundColor: colors.elevated,
      borderRadius: radius.dialog,
      elevation: 8,
      maxWidth: 340,
      paddingBottom: 20,
      paddingHorizontal: 24,
      paddingTop: 24,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      width: '100%',
    },
    content: { gap: 8 },
    title: { ...text.title2, color: colors.textPrimary },
    description: { ...text.body2, color: colors.textSecondary },
    actions: { flexDirection: 'row', gap: 8, paddingTop: 16 },
    action: { flex: 1 },
    destructiveAction: {
      alignItems: 'center',
      backgroundColor: colors.danger,
      borderRadius: radius.button,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 16,
    },
    destructiveLabel: { ...text.body2Strong, color: colors.onPrimary },
    pressed: { opacity: 0.85 },
  } as const;
}
