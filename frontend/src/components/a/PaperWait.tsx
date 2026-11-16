import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';

// Renewal A, the two waits of 읽은 수치 확인 (app/(health-data)/ocr-result.tsx): the paper is being
// read, and the paper could not be read. Both are one block in the middle of the screen.

export function PaperReading({ onBack }: { onBack: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="읽은 수치 확인" />
      <ALoading label="건강 수치를 읽는 중" />
    </View>
  );
}

const tips = [
  '밝은 곳에서 그림자 없이 찍어 주세요',
  '결과지 네 모서리가 모두 보이게 해 주세요',
  '글자가 흔들리지 않게 가까이 찍어 주세요',
];

export function PaperFailed({
  busy,
  uploading,
  onBack,
  onFile,
  onPhoto,
}: {
  busy: boolean;
  uploading: boolean;
  onBack: () => void;
  onFile: () => void;
  onPhoto: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="읽은 수치 확인" />
      <ScrollView contentContainerStyle={[styles.failed, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.title}>
          글자를 읽지 못했어요
        </Text>
        <Text style={styles.body}>사진이 흐리거나 결과지 일부가 잘렸을 수 있어요.</Text>
        <Text style={styles.q}>다시 찍을 때는</Text>
        <View style={styles.tips}>
          {tips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <View style={styles.bullet} />
              <Text style={styles.tip}>{tip}</Text>
            </View>
          ))}
        </View>
        <View style={styles.duo}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onFile}
            style={({ pressed }) => [styles.go, styles.ghost, pressed && styles.goPressed]}
          >
            <Text style={styles.goText}>파일에서 고르기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onPhoto}
            style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
          >
            <Text style={[styles.goText, styles.onText]}>{uploading ? '올리는 중…' : '다시 찍기'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    failed: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    body: { ...a.p15, color: colors.textBody, marginTop: 8 },
    q: { ...a.q, marginBottom: 0, marginTop: 26 },
    tips: { gap: 12, marginTop: 10 },
    tipRow: { flexDirection: 'row', gap: 10 },
    bullet: { backgroundColor: colors.primary, borderColor: colors.ink, borderWidth: 2, height: 12, marginTop: 5, width: 12 },
    tip: { ...a.p15, color: colors.ink, flex: 1 },
    duo: { flexDirection: 'row', gap: 8, marginTop: 28 },
    go: { ...a.go, flex: 1, height: 50 },
    ghost: a.goGhost,
    goPressed: a.goPressed,
    goText: { ...a.p15, color: colors.ink },
    onText: a.onText,
  } as const;
}
