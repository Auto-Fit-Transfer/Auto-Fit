import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import {
  getAllHealthDocuments,
  getHealthDocumentErrorMessage,
  uploadHealthDocument,
  type HealthDocumentListItem,
} from '@/src/api/healthDocuments';
import { HealthDataManagementView } from '@/src/components/health-data/HealthDataManagementView';
import { toUploadRouteItem } from '@/src/features/health-data/healthUpload';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';

function uniqueDocuments(items: HealthDocumentListItem[]) {
  return Array.from(new Map(items.map((item) => [item.uploaded_file_id, item])).values());
}

export default function HealthDataManagementScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<HealthDocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setDocuments(uniqueDocuments(await getAllHealthDocuments({ status: 'confirmed' })));
    } catch (error) {
      Alert.alert('건강 데이터를 불러오지 못했어요', getHealthDocumentErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUpload = async (file: SelectedHealthFile) => {
    if (isUploading) return false;
    setIsUploading(true);
    try {
      const response = await uploadHealthDocument(file);
      router.push({
        pathname: '/ocr-result',
        params: {
          source: 'healthDataManagement',
          uploads: JSON.stringify([toUploadRouteItem(file, response.uploaded_file_id)]),
        },
      });
      return true;
    } catch (error) {
      Alert.alert('건강 데이터를 올리지 못했어요', getHealthDocumentErrorMessage(error));
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <HealthDataManagementView
      documents={documents}
      isLoading={isLoading}
      isUploading={isUploading}
      onBack={() => router.back()}
      onUpload={handleUpload}
    />
  );
}
