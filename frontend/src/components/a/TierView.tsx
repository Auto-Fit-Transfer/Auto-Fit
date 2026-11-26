import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { Headline } from '@/src/components/b/Headline';
import { tierDescriptions, tierOrder } from '@/src/features/tier/tierBadges';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's tier screen (11/26, the 지금 | 바꾼다면 picture): the headline says where I am and how far
// the next step is, the five tiers are dots like the home's week (passed = black tick, now = violet ring),
// and the ways to points sit in the black card, each with its way in. A tap on a tier shows what it means.
// There is no character to dress in B, so A's "wear a passed tier" is not here. A view that only shows what it is given.
export interface TierWay {
  title: string;
  detail: string;
  points: number;
  go: string; // the button's word: where the row leads
  onPress: () => void;
}
export interface TierViewProps {
  // The server's habit tier; null while it is read or when it could not be.
  // left: the points still to the next step ("120점"), null at the top step.
  tier: { index: number; name: string; stars: number; ratio: number; points: number; left: string | null; from: string; to: string | null } | null;
  message?: string | null; // said in place of the tier when there is none
  onRetry?: () => void;
  ways: TierWay[];
  onBack: () => void;
}

export function TierView({ tier, message, onRetry, ways, onBack }: TierViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const now = tier?.index ?? -1;
  const [picked, setPicked] = useState<number | null>(null);
  const seen = picked ?? (tier ? now : null);
  const level = tier ? `${tier.name} ${tier.stars}` : '';

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="티어" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {tier ? (
          <View style={styles.hero}>
            <Headline
              lines={[
                // 2 (이) takes 예요; 1 (일) and 3 (삼) end in a consonant and take 이에요
                [{ text: '지금은 ' }, { text: level, mark: true }, { text: tier.stars === 2 ? '예요' : '이에요' }],
                tier.left ? [{ text: '다음 단계까지 ' }, { text: tier.left, mark: true }] : [{ text: '가장 높은 단계예요' }],
              ]}
            />
            {seen !== null ? <Text style={styles.say}>{tierDescriptions[tierOrder[seen]]}</Text> : null}
          </View>
        ) : message ? (
          <Pressable accessibilityRole="button" disabled={!onRetry} onPress={onRetry} style={styles.card}>
            <Text style={styles.say}>{message}</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <View style={styles.spread}>
            <Text style={styles.small}>다섯 단계</Text>
            {tier ? <Text style={styles.points}>{tier.points.toLocaleString('ko-KR')}점</Text> : null}
          </View>
          <View style={styles.steps}>
            {tierOrder.map((code, index) => (
              <Pressable
                accessibilityLabel={`${code}${index === now ? ', 지금 티어' : index < now ? ', 지나온 티어' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: index === seen }}
                hitSlop={4}
                key={code}
                onPress={() => setPicked(index)}
                style={styles.step}
              >
                <View style={[styles.dot, index < now ? styles.dotDone : index === now ? styles.dotNow : styles.dotNext]}>
                  {index < now ? <CheckIcon color={colors.onPrimary} height={18} width={18} /> : index === now ? <View style={styles.core} /> : null}
                </View>
                <Text style={[styles.stepName, index > now && styles.stepOff, index === seen && styles.stepSeen]}>{code}</Text>
              </Pressable>
            ))}
          </View>
          {tier ? (
            <View style={styles.barBlock}>
              <View accessibilityRole="progressbar" accessibilityValue={{ max: 100, min: 0, now: Math.round(tier.ratio) }} style={styles.bar}>
                <View style={[styles.barFill, { width: `${tier.ratio}%` }]} />
              </View>
              <View style={styles.spread}>
                <Text style={styles.small}>{tier.from}</Text>
                <Text style={styles.small}>{tier.to ?? '가장 높은 단계'}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.ai}>
          <Text accessibilityRole="header" style={styles.aiTitle}>점수는 이렇게 올라요</Text>
          <View style={styles.lines}>
            {ways.map((way, index) => (
              <View key={way.title} style={[styles.way, index > 0 && styles.wayLine]}>
                <View style={styles.wayCopy}>
                  <Text style={styles.wayTitle}>{way.title}</Text>
                  <Text style={styles.wayDetail}>{way.detail}</Text>
                </View>
                <Text style={styles.plus}>+{way.points}</Text>
                <Pressable accessibilityLabel={`${way.title}, ${way.go}`} accessibilityRole="button" hitSlop={5} onPress={way.onPress} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
                  <Text style={styles.goText}>{way.go}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    // the B screens' measures: 24 at the sides, 20 between the blocks here (a short screen, room to breathe)
    content: { gap: 20, paddingHorizontal: 24, paddingTop: 8 },
    hero: { gap: 8, paddingTop: 4 },
    say: { color: colors.textBody, fontSize: 15, lineHeight: 22 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    spread: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
    pressed: { opacity: 0.7 },

    card: { backgroundColor: colors.surface, borderRadius: 28, gap: 16, paddingBottom: 24, paddingHorizontal: 22, paddingTop: 22 },
    points: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 28 },
    steps: { flexDirection: 'row', justifyContent: 'space-between' },
    step: { alignItems: 'center', gap: 6, minWidth: 56 },
    dot: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    dotDone: { backgroundColor: colors.primary },
    dotNow: { backgroundColor: colors.surface, borderColor: colors.now, borderWidth: 2 },
    dotNext: { backgroundColor: colors.surfaceMuted },
    core: { backgroundColor: colors.now, borderRadius: 7, height: 14, width: 14 },
    stepName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12, lineHeight: 17 },
    stepOff: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium },
    stepSeen: { textDecorationLine: 'underline' },
    barBlock: { gap: 8 },
    bar: { backgroundColor: colors.surfaceMuted, borderRadius: 99, height: 8, overflow: 'hidden' },
    barFill: { backgroundColor: colors.primary, borderRadius: 99, bottom: 0, left: 0, position: 'absolute', top: 0 },

    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 14, padding: 20 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    lines: { borderTopColor: colors.aiLine, borderTopWidth: 1, paddingTop: 4 },
    way: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 68 },
    wayLine: { borderTopColor: colors.aiLine, borderTopWidth: 1 },
    wayCopy: { flex: 1, gap: 2, minWidth: 0 },
    wayTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    wayDetail: { color: colors.onAiMuted, fontSize: 12.5, lineHeight: 18 },
    plus: { backgroundColor: colors.lilac, borderRadius: 999, color: colors.lilacInk, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 13, lineHeight: 18, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
    go: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
    goText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
  } as const;
}
