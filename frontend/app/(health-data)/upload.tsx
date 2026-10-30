import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CameraIcon from '@/assets/figma/main/62600.svg';
import DocumentIcon from '@/assets/figma/main/e8bfe.svg';
import TrashIcon from '@/assets/icons/common/Trash.svg';
import { getHealthDocumentErrorMessage, uploadHealthDocument } from '@/src/api/healthDocuments';
import type { OCRUploadRouteItem } from '@/src/features/health-data/ocrResults';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { fontFamilies } from '@/src/theme';

const maximumUploadSize = 10 * 1024 * 1024;
function isSupportedHealthDocument(file: SelectedHealthFile) {
  const mimeType = file.mimeType?.toLowerCase();
  return (
    Boolean(
      mimeType && ['application/pdf', 'image/heic', 'image/jpeg', 'image/png'].includes(mimeType),
    ) || /\.(heic|jpe?g|pdf|png)$/i.test(file.name)
  );
}

export default function HealthDataUploadScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const { isSelecting, pickDocument, removeFile, selectedFiles, takePhoto } = useHealthFilePicker();
  const [isUploading, setIsUploading] = useState(false);
  const busy = isSelecting || isUploading;

  const handleContinue = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    const invalidFile = selectedFiles.find(
      (file) =>
        !isSupportedHealthDocument(file) ||
        (file.size !== undefined && file.size > maximumUploadSize),
    );
    if (invalidFile) {
      Alert.alert(
        '업로드할 수 없는 파일',
        !isSupportedHealthDocument(invalidFile)
          ? 'PDF, PNG, JPEG, HEIC 파일만 업로드할 수 있습니다.'
          : '파일 크기는 10 MiB 이하만 업로드할 수 있습니다.',
      );
      return;
    }
    setIsUploading(true);
    try {
      const responses = await Promise.all(selectedFiles.map((file) => uploadHealthDocument(file)));
      const uploads: OCRUploadRouteItem[] = responses.map((response, index) => ({
        file: {
          height: selectedFiles[index].height,
          mimeType: selectedFiles[index].mimeType,
          name: selectedFiles[index].name,
          size: selectedFiles[index].size,
          source: selectedFiles[index].source,
          uri: selectedFiles[index].uri,
          width: selectedFiles[index].width,
        },
        uploadedFileId: response.uploaded_file_id,
      }));
      router.push({
        pathname: '/ocr-result',
        params: { source, uploads: JSON.stringify(uploads) },
      });
    } catch (error) {
      Alert.alert('건강 데이터 업로드에 실패했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }, [router, selectedFiles, source]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          style={styles.back}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>건강검진 결과나 인바디 결과지가 있나요?</Text>
        <Text style={styles.description}>
          올려 주시면 수치를 읽어서 운동·식단 추천을 내 몸에 맞게 바꿔 드려요.
        </Text>
        <View style={styles.options}>
          <UploadOption
            Icon={CameraIcon}
            disabled={busy}
            label="사진 찍기"
            detail="종이 결과지를 바로 찍어 올려요"
            onPress={takePhoto}
          />
          <UploadOption
            Icon={DocumentIcon}
            disabled={busy}
            label="파일에서 고르기"
            detail="PDF · JPG · PNG · HEIC, 10MB까지"
            onPress={pickDocument}
          />
        </View>
        {selectedFiles.length > 0 ? (
          <View style={styles.selected}>
            <Text style={styles.sectionTitle}>선택한 파일 {selectedFiles.length}개</Text>
            {selectedFiles.map((file, index) => (
              <View key={file.uri + index} style={styles.fileRow}>
                <Text numberOfLines={1} style={styles.fileName}>
                  {file.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={file.name + ' 삭제'}
                  disabled={busy}
                  onPress={() => removeFile(index)}
                >
                  <TrashIcon height={19} width={19} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>이런 자료를 올려요</Text>
        <View style={styles.examples}>
          <View style={styles.exampleRow}>
            <Text style={styles.exampleIcon}>♡</Text>
            <View style={styles.exampleCopy}>
              <Text style={styles.exampleTitle}>건강검진 결과표</Text>
              <Text style={styles.exampleDescription}>국가건강검진 · 병원 검진 결과</Text>
              <Text style={styles.exampleTags}>키　몸무게　혈압　공복혈당　콜레스테롤</Text>
            </View>
          </View>
          <View style={styles.exampleDivider} />
          <View style={styles.exampleRow}>
            <Text style={styles.exampleIcon}>♧</Text>
            <View style={styles.exampleCopy}>
              <Text style={styles.exampleTitle}>인바디 결과지</Text>
              <Text style={styles.exampleDescription}>체성분 · 기초대사량 등</Text>
              <Text style={styles.exampleTags}>체중　골격근량　체지방률　BMI</Text>
            </View>
          </View>
        </View>
        <Text style={styles.privacy}>건강정보가 포함된 자료인지 확인한 뒤 올려 주세요.</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        {selectedFiles.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void handleContinue()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryLabel}>
              {isUploading ? '업로드 중…' : '자료 올리고 계속하기'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => router.replace(source === 'onboarding'
            ? { pathname: '/home', params: { onboardingSkip: '1' } }
            : '/home')}
          style={styles.skipButton}
        >
          <Text style={styles.skipLabel}>나중에 하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UploadOption({
  Icon,
  label,
  detail,
  onPress,
  disabled,
}: {
  Icon: typeof CameraIcon;
  label: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.optionIcon}>
        <Icon height={20} width={20} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', backgroundColor: '#FFFFFF', flex: 1, maxWidth: 412, width: '100%' },
  header: { paddingHorizontal: 20 },
  back: { height: 42, justifyContent: 'center', width: 42 },
  backText: { color: '#222227', fontSize: 32, lineHeight: 36 },
  content: { gap: 13, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 14 },
  heading: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 24,
    lineHeight: 31,
  },
  description: { color: '#777780', fontSize: 13, lineHeight: 19 },
  options: { gap: 9, marginTop: 11 },
  option: {
    alignItems: 'center',
    borderColor: '#E7E7EC',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 13,
  },
  optionIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  optionCopy: { flex: 1, gap: 4, marginLeft: 9 },
  optionTitle: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  optionDetail: { color: '#888890', fontSize: 11 },
  chevron: { color: '#9999A1', fontSize: 24 },
  sectionTitle: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    marginTop: 13,
  },
  selected: { gap: 9 },
  fileRow: {
    alignItems: 'center',
    borderColor: '#E7E7EC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 12,
  },
  fileName: { color: '#333339', flex: 1, fontSize: 13, marginRight: 8 },
  examples: {
    backgroundColor: '#FAFAFB',
    borderColor: '#ECECF1',
    borderRadius: 9,
    borderWidth: 1,
    padding: 14,
  },
  exampleRow: { flexDirection: 'row', gap: 10 },
  exampleIcon: { color: '#777780', fontSize: 22, width: 25 },
  exampleCopy: { flex: 1, gap: 4 },
  exampleTitle: { color: '#333339', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  exampleDescription: { color: '#777780', fontSize: 11 },
  exampleTags: { color: '#9999A1', fontSize: 10, marginTop: 2 },
  exampleDivider: { backgroundColor: '#E7E7EC', height: 1, marginVertical: 12 },
  privacy: { color: '#9999A1', fontSize: 11, lineHeight: 17, marginTop: 5 },
  footer: { backgroundColor: '#FFFFFF', gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#503DD7',
    borderRadius: 8,
    height: 49,
    justifyContent: 'center',
  },
  primaryLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  skipButton: {
    alignItems: 'center',
    backgroundColor: '#F3F3F5',
    borderRadius: 8,
    height: 49,
    justifyContent: 'center',
  },
  skipLabel: { color: '#55555D', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  pressed: { opacity: 0.7 },
});
