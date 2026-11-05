import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { endSession } from '@/src/features/auth/startDestination';
import { resetChatSessionCache } from '@/src/features/chat/chatSessionCache';
import { forgetConversationPeers } from '@/src/features/community/conversationPeers';
import { forgetUploadedFiles } from '@/src/features/health-data/healthUploadSession';
import { getSupabaseClient } from '@/src/lib/supabase';

const OWNER_KEY = 'auto-fit-local-owner';
// Display preferences are left out: they are already stored per user and hold nothing personal.
const USER_DATA_PREFIXES = ['auto-fit.', 'recipe-shopping:'];
const PICKER_CACHE_FOLDERS = ['ImagePicker', 'DocumentPicker'];

// Pickers copy photos and documents here. Whatever a screen did not delete goes at the next start or sign-out.
export function clearPickerCache() {
  if (Platform.OS === 'web') return;
  for (const name of PICKER_CACHE_FOLDERS) {
    try {
      const folder = new Directory(Paths.cache, name);
      if (folder.exists) folder.delete();
    } catch {
      // A locked file is retried at the next start.
    }
  }
}

async function clearUserData() {
  resetChatSessionCache();
  forgetConversationPeers();
  forgetUploadedFiles();
  clearPickerCache();
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((key) => USER_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))));
}

// Runs on every sign-in state change, so one person's data never reaches the next person on this device.
export async function syncLocalOwner(userId: string | null) {
  try {
    if (userId === null) {
      await clearUserData();
      await AsyncStorage.removeItem(OWNER_KEY);
      return;
    }
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner === userId) return;
    if (owner) await clearUserData();
    await AsyncStorage.setItem(OWNER_KEY, userId);
  } catch {
    // Storage errors must not block sign-in or sign-out.
  }
}

export async function signOutOfApp() {
  const { auth } = getSupabaseClient();
  // storageKey is the library's own key for the saved session; it has no public way to drop one offline.
  await endSession(auth, () => AsyncStorage.removeItem(auth['storageKey']));
  await syncLocalOwner(null);
}
