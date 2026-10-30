import { type ReactNode, useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import CameraIcon from '@/assets/icons/system/Camera.svg';
import DocumentIcon from '@/assets/icons/system/Document.svg';
import { AppBottomSheet } from '@/src/components/common';
import { HealthUploadOptionCard } from '@/src/features/health-data/HealthUploadOptionCard';
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

export function HealthDataUploadBottomSheet({
  children,
  isBusy = false,
  onClose,
  onSelectFile,
  visible,
  variant = 'default',
}: Props) {
  const { isSelecting, pickDocument, takePhoto } = useHealthFilePicker();
  const select = useCallback(
    async (selectFile: () => Promise<SelectedHealthFile | null>) => {
      if (isBusy) return;
      const file = await selectFile();
      if (file && variant === 'reupload') {
        const validType =
          ['application/pdf', 'image/heic', 'image/jpeg', 'image/png'].includes(file.mimeType?.toLowerCase() ?? '') ||
          /\.(heic|jpe?g|pdf|png)$/i.test(file.name);
        if (!validType || (file.size !== undefined && file.size > 10 * 1024 * 1024)) {
          Alert.alert('업로드할 수 없는 파일', validType ? '파일 크기는 10 MiB 이하만 업로드할 수 있습니다.' : 'PDF, PNG, JPEG, HEIC 파일만 업로드할 수 있습니다.');
          return;
        }
      }
      if (file) await onSelectFile(file);
    },
    [isBusy, onSelectFile, variant],
  );

  return (
    <AppBottomSheet
      contentStyle={variant === 'reupload' ? styles.reuploadContent : styles.content}
      handleStyle={styles.handle}
      onClose={onClose}
      overlayStyle={styles.overlay}
      separateAnimations
      sheetStyle={styles.sheet}
      title={variant === 'reupload' ? '다시 올리기' : undefined}
      visible={visible}
    >
      {variant === 'reupload' ? (
        <>
          <Text style={styles.reuploadDescription}>새 자료를 올리면 현재 판독 결과를 교체해요.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSelecting || isBusy }}
            disabled={isSelecting || isBusy}
            onPress={() => void select(takePhoto)}
            style={styles.reuploadOption}
          >
            <View style={styles.reuploadIcon}><CameraIcon /></View>
            <View style={styles.reuploadCopy}>
              <Text style={styles.reuploadTitle}>사진 찍기</Text>
              <Text style={styles.reuploadDetail}>종이 결과지를 바로 찍어요</Text>
            </View>
            <Text style={styles.reuploadChevron}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSelecting || isBusy }}
            disabled={isSelecting || isBusy}
            onPress={() => void select(pickDocument)}
            style={styles.reuploadOption}
          >
            <View style={styles.reuploadIcon}><DocumentIcon /></View>
            <View style={styles.reuploadCopy}>
              <Text style={styles.reuploadTitle}>파일에서 고르기</Text>
              <Text style={styles.reuploadDetail}>PDF · JPG · PNG · HEIC, 10MB까지</Text>
            </View>
            <Text style={styles.reuploadChevron}>›</Text>
          </Pressable>
        </>
      ) : <View style={styles.options}>
        <HealthUploadOptionCard
          buttonLabel="카메라 열기"
          description={['처방전, 검진 결과, 체성분', '리포트 등을 촬영하여', '업로드할 수 있어요.']}
          disabled={isSelecting || isBusy}
          Icon={CameraIcon}
          onPress={() => void select(takePhoto)}
          style={styles.optionCard}
          title="카메라로 촬영하기"
        />
        <HealthUploadOptionCard
          buttonLabel="파일 선택"
          description={['이미지, PDF, CSV 파일을', '선택하여 여러 개의 파일을', '한 번에 업로드할 수 있어요.']}
          disabled={isSelecting || isBusy}
          Icon={DocumentIcon}
          onPress={() => void select(pickDocument)}
          secondary
          style={styles.optionCard}
          title="문서/파일 선택하기"
        />
      </View>}
      {children}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 0, paddingHorizontal: 16, paddingTop: 36 },
  handle: { backgroundColor: '#D9D9D9', height: 4, marginTop: 11, width: 40 },
  optionCard: { flex: 1, maxWidth: 180, width: 'auto' },
  options: { flexDirection: 'row', gap: 20, justifyContent: 'center', width: '100%' },
  overlay: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, minHeight: 300 },
  reuploadContent: { gap: 10, paddingBottom: 16, paddingHorizontal: 20, paddingTop: 0 },
  reuploadDescription: { color: '#99979F', fontFamily: fontFamilies.pretendardRegular, fontSize: 12, marginBottom: 4 },
  reuploadOption: { alignItems: 'center', borderColor: '#ECEAF0', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 15 },
  reuploadIcon: { alignItems: 'center', backgroundColor: '#F5F3FA', borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
  reuploadCopy: { flex: 1, gap: 3 },
  reuploadTitle: { color: '#333139', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  reuploadDetail: { color: '#99979F', fontFamily: fontFamilies.pretendardRegular, fontSize: 11 },
  reuploadChevron: { color: '#98949F', fontSize: 22 },
});
