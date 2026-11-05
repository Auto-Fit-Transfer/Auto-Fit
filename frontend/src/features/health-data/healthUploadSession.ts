import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';

// Local file details stay in memory so they never reach a route, browser history or analytics.
const files = new Map<string, SelectedHealthFile>();

export function deleteCachedFile(uri: string) {
  if (Platform.OS === 'web') {
    if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
    return;
  }
  try {
    if (!uri.startsWith(Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Leftovers are removed with the picker cache at the next start or sign-out.
  }
}

export function rememberUploadedFile(uploadedFileId: string, file: SelectedHealthFile) {
  files.set(uploadedFileId, file);
}

export function uploadedFileFor(uploadedFileId: string): SelectedHealthFile {
  return files.get(uploadedFileId) ?? { name: '건강 문서', source: 'document', uri: '' };
}

export function forgetUploadedFile(uploadedFileId: string) {
  const file = files.get(uploadedFileId);
  if (file) deleteCachedFile(file.uri);
  files.delete(uploadedFileId);
}

export function forgetUploadedFiles() {
  [...files.keys()].forEach(forgetUploadedFile);
}
