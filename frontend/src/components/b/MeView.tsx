import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/system/Check.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { ASwitch } from '@/src/components/a/ASwitch';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import { Text } from '@/src/components/common';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline, type HeadlinePart } from './Headline';

// Renewal B's 내 정보 (b-me.html): no profile box. The headline counts the days together; the black card,
// with the face of the character chosen in 물어보기, says what the app knows and fits things to (goal,
// foods, health papers), each with its one button; then the list, 프로필 first.
export interface MeKnow {
  key: string;
  done: string | null; // what it knows; null = not yet
  missing: string;
  action: string;
  onPress: () => void;
}
export interface MeRowB {
  key: string;
  label: string;
  value?: string;
  onPress: () => void;
}

export interface MeViewProps {
  characterId: ChatCharacterId;
  name: string;
  days: number | null;
  tier: { name: string } | null;
  notice?: string | null;
  know: MeKnow[];
  rows: MeRowB[];
  // counting steps: null = this phone cannot count them
  steps: { on: boolean; onToggle: () => void } | null;
  onTier: () => void;
}

export function MeView({ characterId, name, days, tier, notice, know, rows, steps, onTier }: MeViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const headline: HeadlinePart[][] = days
    ? [[{ text: `${name} 님,` }], [{ text: `${days}일째`, mark: true }, { text: ' 함께예요' }]]
    : [[{ text: `${name} 님,` }], [{ text: '반가워요' }]];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Headline lines={headline} />
        {notice ? <Text style={styles.small}>{notice}</Text> : null}

        <View style={styles.ai}>
          <View style={styles.who}>
            <ChatCharacterAvatar characterId={characterId} size={44} />
            <View style={styles.grow}>
              <Pressable accessibilityRole="button" disabled={!tier} hitSlop={6} onPress={onTier}>
                <Text style={styles.hello}>{tier ? `${name} · ${tier.name}` : name}</Text>
              </Pressable>
              <Text style={styles.aiTitle}>이렇게 알고 맞추고 있어요</Text>
            </View>
          </View>
          <View style={styles.lines}>
            {know.map((line) => (
              <View key={line.key} style={styles.line}>
                <View style={[styles.check, line.done ? styles.checkOn : styles.checkOff]}>
                  {line.done ? <CheckIcon color={colors.aiCard} height={14} width={14} /> : null}
                </View>
                <Text style={[styles.lineText, !line.done && styles.lineMissing]}>{line.done ?? line.missing}</Text>
                <Pressable accessibilityLabel={`${line.done ?? line.missing} ${line.action}`} accessibilityRole="button" onPress={line.onPress} style={[styles.pill, !line.done && styles.pillAsk]}>
                  <Text style={[styles.pillText, !line.done && styles.pillAskText]}>{line.action}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          {rows.map((row, index) => (
            <Pressable key={row.key} accessibilityRole="button" onPress={row.onPress} style={[styles.row, index > 0 && styles.rowLine]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              {row.value ? <Text numberOfLines={1} style={styles.rowValue}>{row.value}</Text> : null}
              <CaretRightIcon color={colors.textSecondary} height={16} width={16} />
            </Pressable>
          ))}
          {steps ? (
            <View style={[styles.row, styles.rowLine]}>
              <Text style={styles.rowLabel}>걸음 자동 기록</Text>
              <ASwitch label="걸음 자동 기록" onChange={steps.onToggle} value={steps.on} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, paddingHorizontal: 24 },
    grow: { flex: 1, minWidth: 0 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 16, padding: 20 },
    who: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    hello: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    lines: { borderTopColor: colors.aiLine, borderTopWidth: 1, gap: 12, paddingTop: 14 },
    line: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 40 },
    check: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
    checkOn: { backgroundColor: colors.lilac },
    checkOff: { borderColor: colors.aiRing, borderWidth: 1.5 },
    lineText: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    lineMissing: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardRegular },
    pill: { backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
    pillText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    pillAsk: { backgroundColor: colors.lilac },
    pillAskText: { color: colors.lilacInk },
    card: { backgroundColor: colors.surface, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 6 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 56 },
    rowLine: { borderTopColor: colors.border, borderTopWidth: 1 },
    rowLabel: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    rowValue: { color: colors.textSecondary, flexShrink: 1, fontSize: 13.5, lineHeight: 19, maxWidth: '50%' },
  } as const;
}
