import { type ReactNode, useCallback } from 'react';
import { Alert, Pressable } from 'react-native';

import { aForm } from '@/src/components/a/form';
import { PaperReads } from '@/src/components/a/PaperReads';
import { AppBottomSheet, Text } from '@/src/components/common';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { useThemedStyles, type AppTheme } from '@/src/theme';

type Props = {
  children?: ReactNode;
  isBusy?: boolean;
  onClose: () => void;
  onSelectFile: (file: SelectedHealthFile) => Promise<void> | void;
  visible: boolean;
  variant?: 'default' | 'reupload';
};

export function useHealthFileSelect(onSelectFile: Props['onSelectFile'], isBusy: boolean) {
  const { isSelecting, pickDocument, takePhoto } = useHealthFilePicker();
  const select = useCallback(
    async (selectFile: () => Promise<SelectedHealthFile | null>) => {
      if (isBusy) return;
      const file = await selectFile();
      if (!file) return;
      const validType =
        ['application/pdf', 'image/heic', 'image/jpeg', 'image/png'].includes(file.mimeType?.toLowerCase() ?? '') ||
        /[.](heic|jpe?g|pdf|png)$/i.test(file.name);
      if (!validType || (file.size !== undefined && file.size > 10 * 1024 * 1024)) {
        Alert.alert('업로드할 수 없는 파일', validType ? '파일 크기는 10 MiB 이하만 업로드할 수 있습니다.' : 'PDF, PNG, JPEG, HEIC 파일만 업로드할 수 있습니다.');
        return;
      }
      await onSelectFile(file);
    },
    [isBusy, onSelectFile],
  );
  return {
    isSelecting,
    selectDocument: () => void select(pickDocument),
    selectPhoto: () => void select(takePhoto),
  };
}

// Renewal A: the two ways to give a paper as two outlined rows; when it is a first giving (not a
// re-upload), what the app reads from a paper and how it is kept are said under them.
export function HealthDataUploadBottomSheet({
  children,
  isBusy = false,
  onClose,
  onSelectFile,
  visible,
  variant = 'default',
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { isSelecting, selectDocument, selectPhoto } = useHealthFileSelect(onSelectFile, isBusy);
  const disabled = isSelecting || isBusy;

  return (
    <AppBottomSheet
      contentStyle={styles.content}
      onClose={onClose}
      separateAnimations
      title={variant === 'reupload' ? '다시 올리기' : '자료 올리기'}
      visible={visible}
    >
      {variant === 'reupload' ? (
        <Text style={styles.description}>새 자료를 올리면 지금 결과 대신 새 자료로 다시 읽어요.</Text>
      ) : null}
      <Option detail="종이 결과지를 바로 찍어요" disabled={disabled} onPress={selectPhoto} title="사진 찍기" />
      <Option detail="PDF · JPG · PNG · HEIC, 10MB까지" disabled={disabled} onPress={selectDocument} title="파일에서 고르기" />
      {variant === 'default' ? (
        <>
          <PaperReads style={styles.reads} />
          <Text style={styles.safe}>올린 자료는 암호화해서 보관해요</Text>
        </>
      ) : null}
      {children}
    </AppBottomSheet>
  );
}

function Option({ title, detail, disabled, onPress }: { title: string; detail: string; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    content: { gap: 8, paddingBottom: 20, paddingHorizontal: 16, paddingTop: 0 },
    description: { ...a.p15, color: colors.textBody, marginBottom: 4, marginHorizontal: 4 },
    option: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 3,
      justifyContent: 'center',
      minHeight: 62,
      paddingHorizontal: 12,
    },
    pressed: { backgroundColor: colors.primaryLight },
    title: { ...a.p15, color: colors.ink },
    detail: a.note,
    reads: { marginHorizontal: 4, marginTop: 12 },
    safe: { ...a.note, marginHorizontal: 4, marginTop: 6 },
  } as const;
}
