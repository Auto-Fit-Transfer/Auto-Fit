import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles({ colors }: AppTheme) {
  // Renewal B: a white card without an outline, the question bold, pill buttons.
  const words = { fontFamily: fontFamilies.pretendardRegular, fontSize: 15, lineHeight: 21 } as const;
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(1, 1, 1, 0.45)',
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
    dialog: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      maxWidth: 340,
      paddingBottom: 22,
      paddingHorizontal: 20,
      paddingTop: 22,
      width: '100%',
    },
    content: { gap: 8 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 20, lineHeight: 28 },
    description: { ...words, color: colors.textSecondary, fontSize: 14.5, lineHeight: 22 },
    actions: { flexDirection: 'row', gap: 8, paddingBottom: 4, paddingTop: 16 },
    action: { flex: 1 },
    // What cannot be undone: the same button, its words in the warning colour.
    destructiveAction: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 16,
    },
    destructiveLabel: { ...words, color: colors.danger, fontFamily: fontFamilies.pretendardBold },
    pressed: { opacity: 0.85 },
  } as const;
}
