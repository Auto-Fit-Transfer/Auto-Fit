import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '@/src/theme';

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
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="대화상자 닫기"
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={[styles.dialog, shadows.floating]}>
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

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    maxWidth: 340,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  description: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingTop: 0 },
  action: { flex: 1, height: 48 },
  destructiveAction: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  destructiveLabel: { ...typography.button, color: colors.surface },
  pressed: { opacity: 0.82 },
});
