import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export interface SelectedHealthFile {
  height?: number;
  mimeType?: string;
  name: string;
  size?: number;
  source: 'camera' | 'document';
  uri: string;
  webFile?: Blob;
  width?: number;
}

function cameraFileName(asset: ImagePicker.ImagePickerAsset) {
  if (asset.fileName) return asset.fileName;

  const extension = asset.mimeType?.split('/')[1] ?? 'jpg';
  return `health-photo-${Date.now()}.${extension}`;
}

export function useHealthFilePicker() {
  const [selectedFiles, setSelectedFiles] = useState<SelectedHealthFile[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);

  const appendFile = useCallback((file: SelectedHealthFile) => {
    setSelectedFiles((current) => [...current, file]);
  }, []);

  const clearFiles = useCallback(() => setSelectedFiles([]), []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const takePhoto = useCallback(async () => {
    if (isSelecting) return null;
    setIsSelecting(true);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '카메라 권한이 필요해요',
          '건강 데이터를 촬영하려면 기기 설정에서 카메라 접근을 허용해주세요.',
        );
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.back,
        mediaTypes: ['images'],
        quality: 1,
      });

      if (result.canceled) return null;

      const asset = result.assets[0];
      const file: SelectedHealthFile = {
        height: asset.height,
        mimeType: asset.mimeType,
        name: cameraFileName(asset),
        size: asset.fileSize,
        source: 'camera',
        uri: asset.uri,
        width: asset.width,
      };
      appendFile(file);
      return file;
    } catch (error) {
      console.error('카메라 실행 실패:', error);
      Alert.alert('카메라를 열 수 없어요', '잠시 후 다시 시도해주세요.');
      return null;
    } finally {
      setIsSelecting(false);
    }
  }, [appendFile, isSelecting]);

  const pickDocument = useCallback(async () => {
    if (isSelecting) return null;
    setIsSelecting(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
      });

      if (result.canceled) return null;

      const asset = result.assets[0];
      const file: SelectedHealthFile = {
        mimeType: asset.mimeType,
        name: asset.name,
        size: asset.size,
        source: 'document',
        uri: asset.uri,
        webFile: asset.file,
      };
      appendFile(file);
      return file;
    } catch (error) {
      console.error('파일 선택 실패:', error);
      Alert.alert('파일을 선택할 수 없어요', '잠시 후 다시 시도해주세요.');
      return null;
    } finally {
      setIsSelecting(false);
    }
  }, [appendFile, isSelecting]);

  return { clearFiles, isSelecting, pickDocument, removeFile, selectedFiles, takePhoto };
}
