import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHealthDocumentErrorMessage, uploadHealthDocument } from '@/src/api/healthDocuments';
import { deleteCachedFile, rememberUploadedFile } from '@/src/features/health-data/healthUploadSession';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { aForm } from '@/src/components/a/form';
import { PaperReads } from '@/src/components/a/PaperReads';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
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
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const { clearFiles, isSelecting, pickDocument, removeFile, selectedFiles, takePhoto } = useHealthFilePicker();
  const [isUploading, setIsUploading] = useState(false);
  const busy = isSelecting || isUploading;
  const pickedFiles = useRef(selectedFiles);
  useEffect(() => { pickedFiles.current = selectedFiles; }, [selectedFiles]);
  // Files handed to the result screen are out of this list by then; the rest were never uploaded.
  useEffect(() => () => pickedFiles.current.forEach((file) => deleteCachedFile(file.uri)), []);

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
      responses.forEach((response, index) => rememberUploadedFile(response.uploaded_file_id, selectedFiles[index]));
      router.push({
        pathname: '/ocr-result',
        params: { source, uploads: responses.map((response) => response.uploaded_file_id).join(',') },
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
      <ScreenHeader onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} title="건강 서류" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 72 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>건강검진 결과나{'\n'}인바디 결과지가 있나요?</Text>
        <Text style={styles.description}>
          올려 주시면 수치를 읽어서 운동 · 식단 추천을 내 몸에 맞게 바꿔 드려요.
        </Text>
        <View style={styles.options}>
          <UploadOption disabled={busy} label="사진 찍기" detail="종이 결과지를 바로 찍어요" onPress={takePhoto} />
          <UploadOption disabled={busy} label="파일에서 고르기" detail="PDF · JPG · PNG · HEIC, 10MB까지" onPress={pickDocument} />
        </View>
        {selectedFiles.length > 0 ? (
          <View style={styles.selected}>
            <Text style={styles.q}>선택한 파일 {selectedFiles.length}개</Text>
            {selectedFiles.map((file, index) => (
              <View key={file.uri + index} style={styles.fileRow}>
                <Text numberOfLines={1} style={styles.fileName}>
                  {file.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={file.name + ' 빼기'}
                  disabled={busy}
                  hitSlop={8}
                  onPress={() => {
                    deleteCachedFile(file.uri);
                    removeFile(index);
                  }}
                  style={styles.mini}
                >
                  <Text style={styles.miniText}>빼기</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <PaperReads style={styles.reads} />
        <Text style={styles.privacy}>올린 자료는 암호화해서 보관해요</Text>
        <View style={styles.footer}>
        {selectedFiles.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void handleContinue()}
            style={({ pressed }) => [styles.go, styles.goGap, pressed && styles.goPressed]}
          >
            <Text style={styles.goText}>{isUploading ? '올리는 중…' : '자료 올리기'}</Text>
            {isUploading ? null : <Text style={styles.reward}>+15</Text>}
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
          <Text style={styles.skipLabel}>{source === 'onboarding' ? '아직은 올리지 않기' : '나중에 하기'}</Text>
        </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function UploadOption({
  label,
  detail,
  onPress,
  disabled,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <Text style={styles.optionTitle}>{label}</Text>
      <Text style={styles.optionDetail}>{detail}</Text>
    </Pressable>
  );
}

// Renewal A: the question in pixel letters, the two ways to give a paper as outlined rows, and the
// one button that sends what was picked (the gold +15 is the tier rule for a paper, once a month).
function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    // One block in the middle of the height, a little above it: the question, the two ways, and the way out.
    content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingTop: 8 },
    heading: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 30 },
    description: { ...a.p15, color: colors.textBody, marginTop: 8 },
    options: { gap: 8, marginTop: 18 },
    option: {
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      gap: 3,
      justifyContent: 'center',
      minHeight: 62,
      paddingHorizontal: 12,
    },
    optionTitle: { ...a.p15, color: colors.ink },
    optionDetail: a.note,
    selected: { gap: 8, marginTop: 18 },
    q: { ...a.q, marginBottom: 0 },
    fileRow: { ...a.field, gap: 8, paddingRight: 6 },
    fileName: { ...a.p15, color: colors.ink, flex: 1 },
    mini: a.mini,
    miniText: a.miniText,
    reads: { ...a.card, marginTop: 22, paddingHorizontal: 16, paddingVertical: 14 },
    privacy: { ...a.note, marginTop: 14, textAlign: 'center' },
    footer: { marginTop: 18 },
    go: a.go,
    goGap: { marginBottom: 10 },
    goPressed: a.goPressed,
    goText: a.goText,
    reward: a.reward,
    skipButton: { alignItems: 'center', height: 44, justifyContent: 'center' },
    skipLabel: a.link,
    pressed: { backgroundColor: colors.primaryLight },
  } as const;
}
