import type { OCRUploadRouteItem } from './ocrResults';
import type { SelectedHealthFile } from './useHealthFilePicker';

const maximumUploadSize = 10 * 1024 * 1024;

function isSupportedHealthDocument(file: SelectedHealthFile) {
  const mimeType = file.mimeType?.toLowerCase();
  if (mimeType && ['application/pdf', 'image/heic', 'image/jpeg', 'image/png'].includes(mimeType)) {
    return true;
  }

  return /\.(heic|jpe?g|pdf|png)$/i.test(file.name);
}

// Why a picked file cannot be sent, or null when it can (PDF · JPG · PNG · HEIC up to 10MB).
export function getHealthFileProblem(file: SelectedHealthFile) {
  if (!isSupportedHealthDocument(file)) return 'PDF, JPG, PNG, HEIC 파일만 올릴 수 있어요.';
  if (file.size !== undefined && file.size > maximumUploadSize) {
    return '파일 크기는 10MB 이하만 올릴 수 있어요.';
  }
  return null;
}

// What the result screen needs to show a picked file after it is sent.
export function toUploadRouteItem(
  file: SelectedHealthFile,
  uploadedFileId: string,
): OCRUploadRouteItem {
  return {
    file: {
      height: file.height,
      mimeType: file.mimeType,
      name: file.name,
      size: file.size,
      source: file.source,
      uri: file.uri,
      width: file.width,
    },
    uploadedFileId,
  };
}
