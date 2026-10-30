import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

const KEY = 'auto-fit.exercise.voice-guide.v1';

export type VoiceGuideSettings = {
  enabled: boolean;
  countReps: boolean;
  announceRest: boolean;
  speed: 'slow' | 'normal' | 'fast';
};

export const defaultVoiceGuideSettings: VoiceGuideSettings = {
  enabled: false, countReps: true, announceRest: true, speed: 'normal',
};

export async function loadVoiceGuideSettings(): Promise<VoiceGuideSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultVoiceGuideSettings;
    const parsed = JSON.parse(raw) as Partial<VoiceGuideSettings>;
    return {
      enabled: parsed.enabled === true,
      countReps: parsed.countReps !== false,
      announceRest: parsed.announceRest !== false,
      speed: parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal',
    };
  } catch {
    return defaultVoiceGuideSettings;
  }
}

export function saveVoiceGuideSettings(settings: VoiceGuideSettings) {
  return AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

export function speakGuide(text: string, settings: VoiceGuideSettings) {
  if (!settings.enabled || !text.trim()) return;
  void Speech.stop().catch(() => undefined).then(() => {
    Speech.speak(text, {
      language: 'ko-KR',
      rate: settings.speed === 'slow' ? 0.8 : settings.speed === 'fast' ? 1.2 : 1,
    });
  }).catch(() => undefined);
}

export function stopGuide() {
  void Speech.stop().catch(() => undefined);
}
