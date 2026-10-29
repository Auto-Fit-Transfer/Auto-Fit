import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, View } from 'react-native';

import { getHealthDocument, getHealthDocumentErrorMessage } from '@/src/api/healthDocuments';
import { OCRReview } from '@/src/components/health-data/OCRReview';
import { SubScreen } from '@/src/components/navigation';
import {
  type OCRResultItem,
  type OCRUploadRouteItem,
  mapHealthDocumentToOCRResult,
} from '@/src/features/health-data/ocrResults';
import { useAppTheme } from '@/src/theme';

function parseUploadRouteItems(value?: string): OCRUploadRouteItem[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is OCRUploadRouteItem => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<OCRUploadRouteItem>;
      const file = candidate.file;
      return (
        typeof candidate.uploadedFileId === 'string' &&
        typeof file === 'object' &&
        file !== null &&
        typeof file.name === 'string' &&
        typeof file.uri === 'string' &&
        (file.source === 'camera' || file.source === 'document')
      );
    });
  } catch {
    return [];
  }
}

// Loads the sent sheets, then shows the review (Figma B3 · B5).
export default function OCRResultScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { source, uploads } = useLocalSearchParams<{ source?: string; uploads?: string }>();
  const uploadItems = useMemo(() => parseUploadRouteItems(uploads), [uploads]);
  const isFromHealthDataManagement = source === 'healthDataManagement';
  const [results, setResults] = useState<OCRResultItem[] | null>(null);

  useEffect(() => {
    let isActive = true;

    if (uploadItems.length === 0) {
      Alert.alert('올린 자료 정보가 없어요', '건강 데이터 올리기 화면에서 다시 시도해 주세요.');
      router.back();
      return () => {
        isActive = false;
      };
    }

    void (async () => {
      try {
        const nextResults = await Promise.all(
          uploadItems.map(async (item) =>
            mapHealthDocumentToOCRResult(await getHealthDocument(item.uploadedFileId), item.file),
          ),
        );
        if (isActive) setResults(nextResults);
      } catch (error) {
        console.error('Health document result load failed:', error);
        if (isActive) {
          Alert.alert('읽은 결과를 불러오지 못했어요', getHealthDocumentErrorMessage(error));
          router.back();
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [router, uploadItems]);

  if (!results || results.length === 0) {
    return (
      <SubScreen onBack={() => router.back()} title="판독 결과 확인">
        <View style={{ alignItems: 'center', paddingVertical: 80 }}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </SubScreen>
    );
  }

  return (
    <OCRReview
      finishLabel={isFromHealthDataManagement ? '완료' : '다음'}
      initialResults={results}
      onBack={() => router.back()}
      onFinished={() =>
        isFromHealthDataManagement
          ? router.dismissTo('/health-data-management')
          : router.push('/total-analysis')
      }
      onHome={() => router.dismissTo('/home')}
    />
  );
}
