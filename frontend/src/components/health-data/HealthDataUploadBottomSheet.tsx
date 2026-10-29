import type { ReactNode } from 'react';

import { AppBottomSheet, Text } from '@/src/components/common';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { useThemedStyles, type AppTheme } from '@/src/theme';

import { HealthUploadOptions } from './HealthUploadOptions';

type Props = {
  children?: ReactNode;
  isBusy?: boolean;
  onClose: () => void;
  onSelectFile: (file: SelectedHealthFile) => Promise<void> | void;
  visible: boolean;
  title?: string;
  description?: string;
};

// Figma B4: the same two cards as the first upload screen (B1), in a sheet.
export function HealthDataUploadBottomSheet({
  children,
  isBusy = false,
  onClose,
  onSelectFile,
  visible,
  title = '다시 올리기',
  description = '새 자료를 올리면 지금 결과 대신 새 자료로 다시 읽어요.',
}: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <AppBottomSheet contentStyle={styles.content} onClose={onClose} title={title} visible={visible}>
      <Text style={styles.description}>{description}</Text>
      <HealthUploadOptions busy={isBusy} onSelectFile={onSelectFile} />
      {children}
    </AppBottomSheet>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    content: { gap: 20, paddingBottom: 8 },
    description: { ...text.body2, color: colors.textSecondary },
  } as const;
}
