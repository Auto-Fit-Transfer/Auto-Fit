import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline } from '@/src/components/b/Headline';
import { aForm } from './form';

// The two waits of 읽은 수치 확인 (app/(health-data)/ocr-result.tsx), in renewal B's way (b-docs.html): while
// the paper is read there is only the app's black card with a moving line; a paper that could not be read is
// one block a little above the middle, the buttons right under it.

export function PaperReading({ onBack }: { onBack: () => void }) {
  const styles = useThemedStyles(createStyles);
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setAt((value) => (value + 1) % 3), 400);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="읽은 수치 확인" />
      <View style={styles.readWrap}>
        <View accessibilityLabel="건강 수치를 읽는 중" accessibilityRole="progressbar" accessible style={styles.ai}>
          <Text style={styles.aiName}>오토핏</Text>
          <Text style={styles.aiTitle}>건강 수치를 읽고 있어요</Text>
          <View style={styles.dots}>
            {[0, 1, 2].map((dot) => (
              <View key={dot} style={[styles.dot, { opacity: at === dot ? 1 : 0.3 }]} />
            ))}
          </View>
        </View>
      </View>
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
        <Headline lines={[[{ text: '글자를' }], [{ text: '읽지 못했어요' }]]} />
        <Text style={styles.body}>사진이 흐리거나 결과지 일부가 잘렸을 수 있어요.</Text>
        <View style={styles.tips}>
          <Text style={styles.q}>다시 찍을 때는</Text>
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
            <Text style={styles.ghostText}>파일에서 고르기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onPhoto}
            style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
          >
            <Text style={styles.goText}>{uploading ? '올리는 중…' : '다시 찍기'}</Text>
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
    readWrap: { flex: 1, justifyContent: 'center', paddingBottom: '18%', paddingHorizontal: 24 },
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 4, padding: 22 },
    aiName: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    dots: { flexDirection: 'row', gap: 6, marginTop: 10 },
    dot: { backgroundColor: colors.lilac, borderRadius: 4, height: 8, width: 8 },
    failed: { flexGrow: 1, gap: 14, justifyContent: 'center', paddingHorizontal: 24 },
    body: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 22, marginTop: -4 },
    q: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    tips: { ...a.card, gap: 10, paddingHorizontal: 20, paddingVertical: 18 },
    tipRow: { flexDirection: 'row', gap: 10 },
    bullet: { backgroundColor: colors.textPrimary, borderRadius: 3, height: 6, marginTop: 8, width: 6 },
    tip: { color: colors.textPrimary, flex: 1, fontSize: 14, lineHeight: 21 },
    duo: { flexDirection: 'row', gap: 10 },
    go: { ...a.go, flex: 1, height: 52 },
    ghost: { backgroundColor: colors.surface },
    goPressed: a.goPressed,
    goText: a.goText,
    ghostText: { ...a.goText, color: colors.textPrimary },
  } as const;
}
