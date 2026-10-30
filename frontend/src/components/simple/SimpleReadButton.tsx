import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Speech from 'expo-speech';

import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies } from '@/src/theme';

type Props = {
  text: string;
  label?: string;
};

/** The R11 read control is available only while simple mode is enabled. */
export function SimpleReadButton({ text, label = '화면 읽어 주기' }: Props) {
  const { isDark, preferences } = useDisplayPreferences();
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    if (speaking) void Speech.stop();
  }, [speaking]);

  if (!preferences.simple_mode_enabled) return null;

  const toggle = async () => {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    await Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language: 'ko-KR',
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? '읽어 주기 멈추기' : label}
      onPress={() => void toggle()}
      style={[styles.button, isDark && styles.darkButton]}
    >
      <Text style={[styles.label, isDark && styles.darkLabel]}>{speaking ? '◼ 멈추기' : '◁ 읽어 주기'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DDE0E6', borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 11 },
  darkButton: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  label: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  darkLabel: { color: darkColors.textPrimary },
});
