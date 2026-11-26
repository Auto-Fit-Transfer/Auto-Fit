import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { tierDescriptions, tierOrder } from '@/src/features/tier/tierBadges';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';
import { Hero, PixelIcon, type Who } from './sprites';
import { lookOf, useWorn, wear } from './worn';

// Renewal A's tier screen (the tier box of a-home.html): my character at each of the five tiers in one
// row. A tap looks at a tier; one I have already passed can be worn again, and the tier itself stays.
// Then where my points stand and what gives them. A view that only shows what it is given.
export interface TierWay {
  title: string;
  detail: string;
  points: number;
  icon: number; // its place in the pixel icons
  onPress: () => void;
}
export interface TierViewProps {
  who: Who;
  // The server's habit tier; null while it is read or when it could not be.
  tier: { index: number; name: string; stars: number; ratio: number; points: number; left: string; from: string; to: string | null } | null;
  message?: string | null; // said in place of the tier when there is none
  onRetry?: () => void;
  ways: TierWay[];
  onBack: () => void;
}

export function TierView({ who, tier, message, onRetry, ways, onBack }: TierViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const worn = useWorn();
  const now = tier?.index ?? 0;
  const wearing = lookOf(now, worn);
  const [picked, setPicked] = useState<number | null>(null);
  const seen = picked ?? wearing;
  const canWear = tier !== null && seen <= now && seen !== wearing;

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="티어" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.row}>
            {tierOrder.map((code, index) => (
              <Pressable
                accessibilityLabel={`${code}${index === now ? ', 지금 티어' : ''}${index === wearing && index !== now ? ', 착용 중' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: index === seen }}
                key={code}
                onPress={() => setPicked(index)}
                style={[styles.cell, index === seen && styles.cellOn]}
              >
                <Text style={styles.tag}>{index === now && tier ? '지금' : index === wearing && tier ? '착용 중' : ' '}</Text>
                {/* The drawings are wider than a cell; their empty sides may overlap. */}
                <Hero exact tier={index} who={who} zoom={1} />
                <Text style={styles.cellName}>{code}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.say}>{tierDescriptions[tierOrder[seen]]}</Text>
          {canWear ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                wear(seen < now ? seen : null);
                setPicked(null);
              }}
              style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
            >
              <Text style={styles.goText}>{seen === now ? '지금 티어 캐릭터로 돌아가기' : '이 캐릭터로 바꾸기'}</Text>
            </Pressable>
          ) : null}
        </View>

        {tier ? (
          <View style={[styles.card, styles.points]}>
            <View style={styles.spread}>
              <Text style={styles.big}>{tier.points.toLocaleString('ko-KR')}점</Text>
              <Text style={styles.level}>
                {tier.name}{' '}
                <Text style={styles.stars}>
                  {[1, 2, 3].map((star) => (
                    <Text key={star} style={{ color: star <= tier.stars ? colors.textPrimary : colors.surfaceMuted }}>
                      ★
                    </Text>
                  ))}
                </Text>
              </Text>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ max: 100, min: 0, now: Math.round(tier.ratio) }} style={styles.bar}>
              <View style={[styles.barFill, { width: `${tier.ratio}%` }]} />
            </View>
            <View style={styles.spread}>
              <Text style={styles.note}>{tier.from}</Text>
              <Text style={styles.note}>{tier.to ?? '가장 높은 단계'}</Text>
            </View>
            <Text style={styles.body}>{tier.left}</Text>
          </View>
        ) : message ? (
          <Pressable accessibilityRole="button" disabled={!onRetry} onPress={onRetry} style={[styles.card, styles.points]}>
            <Text style={styles.body}>{message}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.group}>점수는 이렇게 올라요</Text>
        <View style={[styles.card, styles.ways]}>
          {ways.map((way, index) => (
            <Pressable accessibilityRole="button" key={way.title} onPress={way.onPress} style={({ pressed }) => [styles.way, index > 0 && styles.line, pressed && styles.dim]}>
              <View style={styles.icon}>
                <PixelIcon index={way.icon} />
              </View>
              <View style={styles.wayCopy}>
                <Text style={styles.body}>{way.title}</Text>
                <Text style={styles.note}>{way.detail}</Text>
              </View>
              <Text style={styles.reward}>+{way.points}</Text>
              <CaretRightIcon color={colors.textPrimary} height={18} width={18} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16 },
    note: a.note,
    body: { ...a.p15, color: colors.textPrimary },
    dim: { opacity: 0.7 },
    line: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2 },
    card: { ...a.card, gap: 12, paddingHorizontal: 12, paddingVertical: 12 },

    // the five tiers, my character in each
    row: { flexDirection: 'row', gap: 2 },
    cell: { alignItems: 'center', borderColor: 'transparent', borderRadius: 14, borderWidth: 1, flex: 1, gap: 3, paddingBottom: 8, paddingTop: 6 },
    cellOn: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    tag: { ...a.p12, color: colors.primaryText },
    cellName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 12, lineHeight: 17 },
    say: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    go: { ...a.go, height: 52 },
    goPressed: a.goPressed,
    goText: a.goText,

    // where my points stand
    points: { gap: 10, paddingHorizontal: 16, paddingVertical: 16 },
    spread: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' },
    big: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 36, lineHeight: 42 },
    level: { ...a.p12, color: colors.primaryText },
    stars: { fontSize: 12, lineHeight: 15 },
    bar: { backgroundColor: colors.surfaceMuted, borderRadius: 99, height: 16, overflow: 'hidden' },
    barFill: { backgroundColor: colors.primary, bottom: 0, left: 0, position: 'absolute', top: 0 },

    // what gives points
    group: { ...a.q, marginBottom: 0, marginTop: 10, paddingHorizontal: 2 },
    ways: { gap: 0, paddingHorizontal: 14, paddingVertical: 0 },
    way: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 72, paddingVertical: 10 },
    icon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
    wayCopy: { flex: 1, gap: 2, minWidth: 0 },
    reward: a.reward,
  } as const;
}
