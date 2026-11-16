import { rememberUploadedFile } from '@/src/features/health-data/healthUploadSession';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import {
  getAllHealthDocuments,
  getHealthDocument,
  getHealthDocumentErrorMessage,
  uploadHealthDocument,
  type HealthDocumentListItem,
} from '@/src/api/healthDocuments';
import { PapersView, type PaperFilter } from '@/src/components/a/PapersView';
import { HealthDataUploadBottomSheet } from '@/src/components/health-data/HealthDataUploadBottomSheet';
import { newestOfEachKind, paperNumbers, type PaperNumbers } from '@/src/features/a/paperNumbers';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';

function uploadedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return `${thisYear ? '' : `${date.getFullYear()}년 `}${date.getMonth() + 1}월 ${date.getDate()}일 올림`;
}

function uniqueDocuments(items: HealthDocumentListItem[]) {
  return Array.from(new Map(items.map((item) => [item.uploaded_file_id, item])).values());
}

// Renewal A's 건강 서류 (src/components/a/PapersView.tsx shows it). On top are the main numbers of the
// paper given last of each kind: the list carries no numbers, so those two papers are asked for one by one.
export default function HealthDataManagementScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<HealthDocumentListItem[]>([]);
  const [numbers, setNumbers] = useState<PaperNumbers[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<PaperFilter>('all');
  const [newestFirst, setNewestFirst] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const confirmed = uniqueDocuments(await getAllHealthDocuments({ status: 'confirmed' }));
      setDocuments(confirmed);
      // The numbers are an extra: without them the list still stands.
      void Promise.all(newestOfEachKind(confirmed).map((item) => getHealthDocument(item.uploaded_file_id)))
        .then((papers) => setNumbers(papers.map(paperNumbers)))
        .catch(() => setNumbers([]));
    } catch (error) {
      Alert.alert('건강 데이터를 불러오지 못했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUpload = useCallback(
    async (file: SelectedHealthFile) => {
      if (isUploading) return;
      setIsUploading(true);
      try {
        const response = await uploadHealthDocument(file);
        rememberUploadedFile(response.uploaded_file_id, file);
        setIsUploadSheetOpen(false);
        router.push({
          pathname: '/ocr-result',
          params: { source: 'healthDataManagement', uploads: response.uploaded_file_id },
        });
      } catch (error) {
        Alert.alert('건강 데이터 업로드에 실패했어요.', getHealthDocumentErrorMessage(error));
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, router],
  );

  const rows = useMemo(() => {
    const matching = selectedFilter === 'all' ? documents : documents.filter((item) => item.document_type === selectedFilter);
    const direction = newestFirst ? -1 : 1;
    return [...matching]
      .sort((first, second) => {
        const firstTime = new Date(first.uploaded_at).getTime();
        const secondTime = new Date(second.uploaded_at).getTime();
        if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return 0;
        return (firstTime - secondTime) * direction;
      })
      .map((item) => ({
        id: item.uploaded_file_id,
        kind: item.document_type === 'body_composition' ? '인바디' : '건강검진',
        given: uploadedLabel(item.uploaded_at),
      }));
  }, [documents, newestFirst, selectedFilter]);

  return (
    <>
      <PapersView
        filter={selectedFilter}
        loading={isLoading}
        newestFirst={newestFirst}
        numbers={numbers}
        onAdd={() => setIsUploadSheetOpen(true)}
        onBack={() => router.back()}
        onFilter={setSelectedFilter}
        onSort={() => setNewestFirst((value) => !value)}
        rows={rows}
        total={documents.length}
      />
      <HealthDataUploadBottomSheet isBusy={isUploading} onClose={() => setIsUploadSheetOpen(false)} onSelectFile={handleUpload} visible={isUploadSheetOpen} />
    </>
  );
}
