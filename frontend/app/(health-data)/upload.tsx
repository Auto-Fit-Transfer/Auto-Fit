import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrashIcon from '@/assets/icons/common/Trash.svg';
import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import FileIcon from '@/assets/icons/ui/file-text.svg';
import HeartbeatIcon from '@/assets/icons/ui/heartbeat.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import ScalesIcon from '@/assets/icons/ui/scales.svg';
import { getHealthDocumentErrorMessage, uploadHealthDocument } from '@/src/api/healthDocuments';
import type { OCRUploadRouteItem } from '@/src/features/health-data/ocrResults';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { fontFamilies } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

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
  const { clearFiles, isSelecting, pickDocument, removeFile, selectedFiles, takePhoto } = useHealthFilePicker();
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
      clearFiles();
    } catch (error) {
      Alert.alert('건강 데이터 업로드에 실패했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }, [clearFiles, router, selectedFiles, source]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScreenHeader onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>건강검진 결과나{'\n'}인바디 결과지가 있나요?</Text>
        <Text style={styles.description}>
          올려 주시면 수치를 읽어서 운동 · 식단 추천을 내 몸에 맞게 바꿔 드려요.
        </Text>
        <View style={styles.options}>
          <UploadOption
            Icon={CameraIcon}
            disabled={busy}
            label="사진 찍기"
            detail="종이 결과지를 바로 찍어요"
            onPress={takePhoto}
          />
          <UploadOption
            Icon={FileIcon}
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
                  hitSlop={10}
                  onPress={() => removeFile(index)}
                >
                  <TrashIcon height={20} width={20} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>이런 자료를 읽어요</Text>
        <View style={styles.examples}>
          <ExampleRow Icon={HeartbeatIcon} title="건강검진 결과표" detail="국가건강검진 · 병원 검진 결과" tags={['키', '몸무게', '혈압', '공복혈당', '콜레스테롤', '간 수치']} />
          <View style={styles.exampleDivider} />
          <ExampleRow Icon={ScalesIcon} title="인바디 결과지" detail="헬스장 · 보건소 체성분 측정지" tags={['체중', '골격근량', '체지방률', 'BMI', '기초대사량']} />
        </View>
        <View style={styles.privacyRow}>
          <LockIcon color="#5E5D66" height={18} width={18} />
          <Text style={styles.privacy}>올린 자료는 암호화해서 보관해요.</Text>
        </View>
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
        ) : <Text style={styles.skipHint}>지금 안 올려도 괜찮아요.</Text>}
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

function ExampleRow({ Icon, title, detail, tags }: { Icon: typeof CameraIcon; title: string; detail: string; tags: string[] }) {
  return (
    <View style={styles.exampleRow}>
      <View style={styles.exampleIcon}><Icon color="#17161D" height={20} width={20} /></View>
      <View style={styles.exampleCopy}>
        <Text style={styles.exampleTitle}>{title}</Text>
        <Text style={styles.exampleDescription}>{detail}</Text>
        <View style={styles.tags}>
          {tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}
        </View>
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
    <Pressable hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.optionIcon}>
        <Icon color="#17161D" height={22} width={22} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <CaretRightIcon color="#5E5D66" height={20} width={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', backgroundColor: '#FFFFFF', flex: 1, maxWidth: 412, width: '100%' },
  content: { gap: 12, paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  heading: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30 },
  description: { color: '#3B3A42', fontSize: 16, lineHeight: 24 },
  options: { gap: 12, marginTop: 4 },
  option: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 75, paddingHorizontal: 16 },
  optionIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  optionDetail: { color: '#5E5D66', fontSize: 14, lineHeight: 21 },
  sectionTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21, marginTop: 8 },
  selected: { gap: 8 },
  fileRow: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 14 },
  fileName: { color: '#17161D', flex: 1, fontSize: 14, marginRight: 8 },
  examples: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, padding: 16 },
  exampleRow: { flexDirection: 'row', gap: 12 },
  exampleIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DFE2E7', borderRadius: 10, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  exampleCopy: { flex: 1, gap: 2, minWidth: 0 },
  exampleTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
  exampleDescription: { color: '#5E5D66', fontSize: 12, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { backgroundColor: '#F2F4F6', borderRadius: 6, color: '#3B3A42', fontFamily: fontFamilies.pretendardMedium, fontSize: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  exampleDivider: { backgroundColor: '#DFE2E7', height: 1, marginVertical: 12 },
  privacyRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 4 },
  privacy: { color: '#5E5D66', flex: 1, fontSize: 14, lineHeight: 21 },
  footer: { backgroundColor: '#FFFFFF', gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#5246C6', borderRadius: 12, height: 56, justifyContent: 'center' },
  primaryLabel: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  skipHint: { color: '#5E5D66', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  skipButton: { alignItems: 'center', backgroundColor: '#F2F4F6', borderRadius: 12, height: 56, justifyContent: 'center' },
  skipLabel: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  pressed: { opacity: 0.7 },
});
