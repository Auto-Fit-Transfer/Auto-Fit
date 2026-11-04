import { type ReactNode, useCallback } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import FileIcon from '@/assets/icons/ui/file-text.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { fontFamilies } from '@/src/theme';

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

export function HealthDataUploadBottomSheet({
  children,
  isBusy = false,
  onClose,
  onSelectFile,
  visible,
  variant = 'default',
}: Props) {
  const { isSelecting, selectDocument, selectPhoto } = useHealthFileSelect(onSelectFile, isBusy);
  const disabled = isSelecting || isBusy;

  return (
    <AppBottomSheet
      contentStyle={styles.content}
      handleStyle={styles.handle}
      onClose={onClose}
      overlayStyle={styles.overlay}
      separateAnimations
      sheetStyle={styles.sheet}
      title={variant === 'reupload' ? '다시 올리기' : '자료 올리기'}
      visible={visible}
    >
      <Text style={styles.description}>
        {variant === 'reupload' ? '새 자료를 올리면 지금 결과 대신 새 자료로 다시 읽어요.' : '건강검진 결과나 인바디 결과지를 올려 주세요.'}
      </Text>
      <Option Icon={CameraIcon} detail="종이 결과지를 바로 찍어요" disabled={disabled} onPress={selectPhoto} title="사진 찍기" />
      <Option Icon={FileIcon} detail="PDF · JPG · PNG · HEIC, 10MB까지" disabled={disabled} onPress={selectDocument} title="파일에서 고르기" />
      {children}
    </AppBottomSheet>
  );
}

function Option({ Icon, title, detail, disabled, onPress }: { Icon: typeof CameraIcon; title: string; detail: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable hitSlop={8} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.option}>
      <View style={styles.icon}><Icon color="#17161D" height={22} width={22} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <CaretRightIcon color="#5E5D66" height={20} width={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: { backgroundColor: '#DFE2E7', height: 4, marginTop: 11, width: 40 },
  overlay: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, minHeight: 300 },
  content: { gap: 12, paddingBottom: 16, paddingHorizontal: 20, paddingTop: 0 },
  description: { color: '#3B3A42', fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
  option: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 75, paddingHorizontal: 16 },
  icon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  detail: { color: '#5E5D66', fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
});
