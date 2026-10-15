import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GuideCamera from '@/assets/figma/main/aea5c.svg';
import GuideFile from '@/assets/figma/main/24ce4.svg';
import CameraIcon from '@/assets/figma/main/62600.svg';
import DocumentIcon from '@/assets/figma/main/e8bfe.svg';
import FolderIcon from '@/assets/icons/system/Folder.svg';
import TrashIcon from '@/assets/icons/common/Trash.svg';
import { getHealthDocumentErrorMessage, uploadHealthDocument } from '@/src/api/healthDocuments';
import { AppCard, CustomScrollIndicator, useCustomScrollIndicator } from '@/src/components/common';
import { HealthUploadOptionCard } from '@/src/features/health-data/HealthUploadOptionCard';
import type { OCRUploadRouteItem } from '@/src/features/health-data/ocrResults';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { MainGradient } from '@/src/components/main/MainSurface';
import { StatusBar } from 'expo-status-bar';
import { colors, fontFamilies, radius } from '@/src/theme';

const uploadIllustration = require('@/assets/figma/main/e33e5.png');

const referenceWidth = 412;
const referenceHeight = 917;
const referenceTitleTop = 38;
const referenceSelectedFileTop = 708;
const referenceNextButtonTop = 830;
const selectedFileRowHeight = 50;
const selectedFileRowGap = 8;
const baseBottomContentPadding = 20;
const minimumScreenHeight = 740;
const maximumScreenHeight = 917;
const maximumUploadSize = 10 * 1024 * 1024;

function isSupportedHealthDocument(file: SelectedHealthFile) {
  const mimeType = file.mimeType?.toLowerCase();
  if (mimeType && ['application/pdf', 'image/heic', 'image/jpeg', 'image/png'].includes(mimeType)) {
    return true;
  }

  return /\.(heic|jpe?g|pdf|png)$/i.test(file.name);
}

interface GuideItemProps {
  description: string[];
  Icon: typeof CameraIcon;
  title: string;
}

function GuideItem({ description, Icon, title }: GuideItemProps) {
  return (
    <View style={styles.guideRow}>
      <View style={styles.guideIconBox}>
        <Icon />
      </View>
      <View style={styles.guideTextGroup}>
        <Text style={styles.guideItemTitle}>{title}</Text>
        <Text style={styles.guideDescription}>
          {description.map((line, index) => (
            <Text key={line}>
              {line}
              {index < description.length - 1 ? '\n' : ''}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );
}

interface SelectedFileContentProps {
  onRemove: (index: number) => void;
  selectedFiles: SelectedHealthFile[];
}

function SelectedFileContent({ onRemove, selectedFiles }: SelectedFileContentProps) {
  return (
    <AppCard bordered padding="none" style={styles.selectedFileCard}>
      <View style={styles.selectedFileContent}>
        <View style={styles.selectedFileHeader}>
          <Text style={styles.selectedFileTitle}>업로드된 파일</Text>
          <Text style={styles.selectedFileCount}>{selectedFiles.length}개</Text>
        </View>
        {selectedFiles.length > 0 ? (
          <View style={styles.selectedFileList}>
            {selectedFiles.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={styles.selectedFileInner}>
                <FolderIcon
                  color={colors.textDisabled}
                  fill={colors.textDisabled}
                  height={30}
                  width={30}
                />
                <View style={styles.selectedNameGroup}>
                  <Text numberOfLines={1} style={styles.selectedName}>
                    {file.name}
                  </Text>
                  <Text style={styles.selectedSource}>
                    {file.source === 'camera' ? '카메라 촬영 파일' : '선택된 파일'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`${file.name} 삭제`}
                  accessibilityRole="button"
                  hitSlop={2}
                  onPress={() => onRemove(index)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.deleteButtonPressed,
                  ]}
                >
                  <TrashIcon
                    color={colors.textSecondary}
                    fill={colors.textSecondary}
                    height={18}
                    width={18}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.selectedFileInner}>
            <FolderIcon
              color={colors.textDisabled}
              fill={colors.textDisabled}
              height={30}
              width={30}
            />
            <Text style={styles.emptyFileText}>
              아직 업로드된 파일이 없어요.{`\n`}위의 버튼을 눌러 데이터를 업로드 해주세요.
            </Text>
          </View>
        )}
      </View>
    </AppCard>
  );
}

export default function HealthDataUploadScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { isSelecting, pickDocument, removeFile, selectedFiles, takePhoto } = useHealthFilePicker();
  const [measuredContentBottom, setMeasuredContentBottom] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const widthScale = Math.min(1, availableWidth / referenceWidth);
  const scale = widthScale;
  const scaledWidth = referenceWidth * widthScale;
  const canvasLeft = insets.left + (availableWidth - scaledWidth) / 2;
  const safeTopAdjustment = Math.max(0, insets.top + 8 - referenceTitleTop * scale);
  const screenHeight = Dimensions.get('screen').height;
  const responsiveHeight = Platform.OS === 'android' ? screenHeight : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(
      1,
      (responsiveHeight - minimumScreenHeight) / (maximumScreenHeight - minimumScreenHeight),
    ),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const introTop = 100;
  const uploadCardsTop = 205;
  const guideTop = Math.max(450, uploadCardsTop + 220 + 12);
  const selectedFileTop = Math.max(
    verticalValue(referenceSelectedFileTop, 645),
    guideTop + 230 + 20,
  );
  const additionalFileListHeight =
    Math.max(0, selectedFiles.length - 1) * (selectedFileRowHeight + selectedFileRowGap);
  const nextButtonTop = Math.max(
    verticalValue(referenceNextButtonTop, 760) + additionalFileListHeight,
    selectedFileTop + 100 + additionalFileListHeight + 15,
  );
  const contentBottom = Math.max(measuredContentBottom, nextButtonTop + 45);
  const bottomContentPadding = baseBottomContentPadding + insets.bottom;
  const renderedContentHeight = safeTopAdjustment + contentBottom * scale + bottomContentPadding;
  const needsScroll = renderedContentHeight > windowHeight;
  const scrollIndicator = useCustomScrollIndicator({
    enabled: needsScroll,
    showInitially: true,
  });

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
      console.error('Health document upload failed:', error);
      Alert.alert('건강 데이터 업로드에 실패했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }, [router, selectedFiles, source]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: Math.max(windowHeight, renderedContentHeight),
            paddingBottom: bottomContentPadding,
            paddingTop: safeTopAdjustment,
          },
        ]}
        overScrollMode="never"
        onContentSizeChange={scrollIndicator.onContentSizeChange}
        onLayout={scrollIndicator.onLayout}
        onMomentumScrollBegin={scrollIndicator.onMomentumScrollBegin}
        onMomentumScrollEnd={scrollIndicator.onMomentumScrollEnd}
        onScroll={scrollIndicator.onScroll}
        onScrollBeginDrag={scrollIndicator.onScrollBeginDrag}
        onScrollEndDrag={scrollIndicator.onScrollEndDrag}
        scrollEnabled={needsScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.canvasSlot, { height: contentBottom * scale }]}>
          <View
            style={[
              styles.canvas,
              {
                left: canvasLeft,
                transform: [{ scale }],
              },
            ]}
          >
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 190 }}>
              <MainGradient />
            </View>
            <Text style={[styles.screenTitle, { color: colors.textWhite }]}>
              건강 데이터 업로드
            </Text>

            <View style={[styles.intro, { top: introTop }]}>
              <View style={styles.introTextGroup}>
                <Text style={[styles.introTitle, { color: colors.textWhite }]}>
                  건강 데이터를{`\n`}
                  <Text style={{ color: colors.primaryMedium }}>업로드 해주세요</Text>
                </Text>
              </View>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={uploadIllustration}
                style={styles.illustration}
              />
            </View>

            <View style={[styles.uploadCards, { top: uploadCardsTop }]}>
              <HealthUploadOptionCard
                buttonLabel="카메라 열기"
                description={['건강 문서를 촬영해', '업로드하세요.']}
                disabled={isSelecting || isUploading}
                Icon={CameraIcon}
                onPress={takePhoto}
                title="카메라로 촬영하기"
              />
              <HealthUploadOptionCard
                buttonLabel="파일 선택"
                description={['저장된 건강 파일을', '업로드하세요.']}
                disabled={isSelecting || isUploading}
                Icon={DocumentIcon}
                onPress={pickDocument}
                secondary
                title="문서/파일 선택하기"
              />
            </View>

            <View style={[styles.guideSection, { top: guideTop }]}>
              <Text style={styles.guideTitle}>업로드 안내</Text>
              <GuideItem
                description={[
                  '체성분, 건강검진 결과를 업로드하면',
                  '더 정밀한 맞춤 추천을 받을 수 있어요.',
                ]}
                Icon={GuideCamera}
                title="정확한 맞춤 분석"
              />
              <GuideItem
                description={['JPG, PNG, HEIC, PDF 파일을 지원해요.']}
                Icon={GuideFile}
                title="지원 파일 형식"
              />
              <GuideItem
                description={[
                  '업로드한 건강 데이터로 분석을 진행해요.',
                  '민감한 정보가 포함되어 있는지 확인해 주세요.',
                ]}
                Icon={GuideFile}
                title="안전한 데이터 관리"
              />
            </View>

            <View style={[styles.selectedFilePosition, { top: selectedFileTop }]}>
              <SelectedFileContent onRemove={removeFile} selectedFiles={selectedFiles} />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: selectedFiles.length === 0 || isUploading }}
              disabled={selectedFiles.length === 0 || isUploading}
              onPress={() => void handleContinue()}
              onLayout={(event) => {
                const { height, y } = event.nativeEvent.layout;
                setMeasuredContentBottom(y + height);
              }}
              style={({ pressed }) => [
                styles.nextButton,
                { top: nextButtonTop },
                (selectedFiles.length === 0 || isUploading) && styles.nextButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.nextButtonLabel}>다음</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {needsScroll ? (
        <CustomScrollIndicator
          {...scrollIndicator.indicatorProps}
          bottomInset={Math.max(8, insets.bottom + 4)}
          rightInset={Math.max(4, insets.right + 4)}
          topInset={Math.max(8, insets.top + 4)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    ...StyleSheet.absoluteFill,
    height: '100%',
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
  },
  canvasSlot: {
    position: 'relative',
    width: '100%',
  },
  canvas: {
    height: referenceHeight,
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },
  screenTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    left: 21,
    letterSpacing: 1.5,
    lineHeight: 20,
    position: 'absolute',
    right: 21,
    textAlign: 'center',
    top: 38,
  },
  intro: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 47,
    left: 23,
    position: 'absolute',
    top: 82,
  },
  introTextGroup: {
    gap: 14,
    width: 220,
  },
  introTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 22,
    includeFontPadding: false,
    lineHeight: 27,
  },
  introDescription: {
    color: '#000000',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 20,
  },
  emphasis: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  illustration: {
    position: 'absolute',
    left: 227,
    top: -30,
    height: 120,
    width: 120,
  },
  uploadCards: {
    flexDirection: 'row',
    gap: 12,
    left: 20,
    position: 'absolute',
    top: 231,
  },
  guideSection: {
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
    left: 21,
    position: 'absolute',
    top: 483,
    width: 370,
  },
  guideTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 17,
    includeFontPadding: false,
    lineHeight: 19,
  },
  guideRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  guideIconBox: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  guideTextGroup: {
    gap: 6,
    maxWidth: 315,
  },
  guideItemTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 16,
  },
  guideDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 15,
  },
  selectedFilePosition: {
    left: 21,
    position: 'absolute',
    top: referenceSelectedFileTop,
  },
  selectedFileCard: {
    borderRadius: radius.md,
    minHeight: 100,
    width: 370,
  },
  selectedFileContent: {
    gap: 9,
    padding: 12,
    width: '100%',
  },
  selectedFileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectedFileTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 17,
  },
  selectedFileCount: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 17,
  },
  selectedFileInner: {
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 7,
    flexDirection: 'row',
    gap: 9,
    height: 50,
    paddingLeft: 12,
    paddingRight: 3,
  },
  selectedFileList: {
    gap: selectedFileRowGap,
  },
  emptyFileText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 16,
  },
  selectedNameGroup: {
    flex: 1,
  },
  selectedName: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 11,
    includeFontPadding: false,
    lineHeight: 15,
  },
  selectedSource: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 9,
    includeFontPadding: false,
    lineHeight: 13,
  },
  deleteButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  deleteButtonPressed: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.round,
  },
  nextButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 45,
    justifyContent: 'center',
    left: 21,
    position: 'absolute',
    width: 370,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonLabel: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 20,
    includeFontPadding: false,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.78,
  },
});
