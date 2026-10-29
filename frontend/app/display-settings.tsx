import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { AppBottomSheet, AppButton, Text } from '@/src/components/common';
import { ChoiceSection, SurfaceCard } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import {
  darkPalette,
  lightPalette,
  radius,
  useAppTheme,
  useThemedStyles,
  type AppTheme,
  type ColorModePreference,
} from '@/src/theme';

const modes: { value: ColorModePreference; label: string }[] = [
  { value: 'system', label: '기기 설정대로' },
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
];

// Figma G11 (화면 설정) and G12 (간편 모드로 바꾸기). The text size slider and the "읽어 주기"
// button in the Figma copy wait until the app supports them.
export default function DisplaySettingsScreen() {
  const router = useRouter();
  const { colors, settings, updateSettings } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [confirmEasy, setConfirmEasy] = useState(false);

  return (
    <>
      <SubScreen gap={28} onBack={() => router.back()} title="화면 설정">
        <ChoiceSection title="화면 모드">
          <View accessibilityRole="radiogroup" style={styles.modeRow}>
            {modes.map((mode) => {
              const selected = settings.colorMode === mode.value;
              return (
                <Pressable
                  key={mode.value}
                  accessibilityLabel={mode.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => updateSettings({ colorMode: mode.value })}
                  style={[styles.modeCard, selected && styles.modeCardSelected]}
                >
                  <MiniPhone mode={mode.value} />
                  <Text style={styles.modeLabel}>{mode.label}</Text>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? (
                      <CheckIcon color={colors.onPrimary} height={14} width={14} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.caption}>
            기기 설정대로를 고르면 휴대폰이 어두운 모드일 때 앱도 함께 어두워져요.
          </Text>
        </ChoiceSection>

        <ChoiceSection title="간편 모드">
          <SurfaceCard gap={16}>
            <View style={styles.easyRow}>
              <MiniPhone easy mode="light" />
              <View style={styles.flex}>
                <Text style={styles.strong}>
                  {settings.easyMode ? '간편 모드를 쓰고 있어요' : '큰 글씨로 보기'}
                </Text>
                <Text style={styles.body}>글씨와 버튼을 크게 보여 줘요.</Text>
              </View>
            </View>
            {settings.easyMode ? (
              <AppButton
                onPress={() => updateSettings({ easyMode: false })}
                title="기본 모드로 돌아가기"
                variant="secondary"
              />
            ) : (
              <AppButton
                onPress={() => setConfirmEasy(true)}
                title="간편 모드로 바꾸기"
                variant="secondary"
              />
            )}
          </SurfaceCard>
        </ChoiceSection>
      </SubScreen>

      <AppBottomSheet
        contentStyle={styles.sheetContent}
        footer={
          <>
            <AppButton
              onPress={() => {
                updateSettings({ easyMode: true });
                setConfirmEasy(false);
              }}
              title="간편 모드로 바꾸기"
            />
            <AppButton onPress={() => setConfirmEasy(false)} title="취소" variant="text" />
          </>
        }
        onClose={() => setConfirmEasy(false)}
        title="간편 모드로 바꿀까요?"
        visible={confirmEasy}
      >
        <View style={styles.compare}>
          <View style={styles.compareItem}>
            <MiniPhone mode="light" />
            <Text style={styles.caption}>지금</Text>
          </View>
          <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
          <View style={styles.compareItem}>
            <MiniPhone easy mode="light" />
            <Text style={styles.captionStrong}>간편 모드</Text>
          </View>
        </View>
        {['글씨가 1.25배 커지고 버튼도 커져요', '기록 · 목표는 그대로 이어져요'].map((line) => (
          <View key={line} style={styles.checkRow}>
            <CheckIcon color={colors.success} height={18} width={18} />
            <Text style={styles.body}>{line}</Text>
          </View>
        ))}
        <Text style={styles.caption}>
          마이 › 화면 설정에서 언제든 기본 모드로 돌아갈 수 있어요.
        </Text>
      </AppBottomSheet>
    </>
  );
}

// A small drawing of a screen in the chosen look; "system" shows half light, half dark.
function MiniPhone({ mode, easy = false }: { mode: ColorModePreference; easy?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const bars = easy ? [16, 16, 16] : [10, 10, 10, 10];
  const half = (palette: typeof lightPalette) => (
    <View style={[styles.phoneHalf, { backgroundColor: palette.background }]}>
      <View
        style={[styles.phoneTitle, { backgroundColor: palette.textPrimary, height: easy ? 6 : 4 }]}
      />
      {bars.map((height, index) => (
        <View
          key={index}
          style={[styles.phoneBar, { backgroundColor: palette.surfaceMuted, height }]}
        />
      ))}
    </View>
  );
  return (
    <View style={styles.phone}>
      {mode === 'dark' ? half(darkPalette) : half(lightPalette)}
      {mode === 'system' ? <View style={styles.phoneSplit}>{half(darkPalette)}</View> : null}
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1, gap: 4 },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    body: { ...text.body2, color: colors.textBody },
    caption: { ...text.caption, color: colors.textSecondary },
    captionStrong: { ...text.captionStrong, color: colors.textPrimary },
    modeRow: { flexDirection: 'row', gap: 8 },
    modeCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      flex: 1,
      gap: 8,
      paddingVertical: 12,
    },
    modeCardSelected: { borderColor: colors.primary, borderWidth: 1.5 },
    modeLabel: { ...text.caption, color: colors.textPrimary, textAlign: 'center' },
    radio: {
      alignItems: 'center',
      borderColor: colors.textDisabled,
      borderRadius: 11,
      borderWidth: 1.5,
      height: 22,
      justifyContent: 'center',
      width: 22,
    },
    radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    phone: {
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 92,
      overflow: 'hidden',
      width: 62,
    },
    phoneHalf: { flex: 1, gap: 4, padding: 6 },
    phoneSplit: { bottom: 0, left: '50%', position: 'absolute', right: 0, top: 0 },
    phoneTitle: { borderRadius: 2, marginBottom: 2, width: '70%' },
    phoneBar: { borderRadius: 3 },
    easyRow: { alignItems: 'center', flexDirection: 'row', gap: 16 },
    sheetContent: { gap: 14, paddingBottom: 8 },
    compare: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'center',
      paddingVertical: 8,
    },
    compareItem: { alignItems: 'center', gap: 6 },
    checkRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  } as const;
}
