import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DownIcon from '@/assets/icons/common/chevrons/Down.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline, type HeadlinePart } from './Headline';

// Renewal B's exercise tab, as a view that only shows what it is given: the big headline with the
// pill that switches the kind of exercise, the one sentence saying why, the routine as a card with
// its one main button, and the rows that lead to the rest. app/(tabs)/exercise.tsx fills it.
export interface ExerciseViewProps {
  headline: HeadlinePart[][];
  kind: { label: string; onPress: () => void };
  line?: string;
  error?: { text: string; onRetry: () => void } | null;
  card: {
    facts?: string;
    detail?: { label: string; onPress: () => void };
    moves: { key: string; name: string; detail: string }[];
    main: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean };
    links: { label: string; onPress: () => void }[];
  };
  more: { key: string; title: string; detail?: string; onPress: () => void }[];
  headerRight?: ReactNode;
}

export function ExerciseView({ headline, kind, line, error, card, more, headerRight }: ExerciseViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Headline lines={headline} />
          </View>
          <View style={styles.heroSide}>
            <Pressable
              accessibilityLabel={`운동 종류 ${kind.label}, 바꾸기`}
              accessibilityRole="button"
              onPress={kind.onPress}
              style={styles.kind}
            >
              <Text style={styles.kindText}>{kind.label}</Text>
              <DownIcon color={colors.textPrimary} height={16} width={16} />
            </Pressable>
            {headerRight}
          </View>
        </View>
        {line ? <Text style={styles.line}>{line}</Text> : null}

        {error ? (
          <Pressable accessibilityRole="button" onPress={error.onRetry} style={styles.error}>
            <Text style={styles.errorText}>{error.text}</Text>
            <Text style={styles.errorRetry}>다시 시도</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          {card.facts || card.detail ? (
            <View style={styles.factRow}>
              <Text style={styles.facts}>{card.facts}</Text>
              {card.detail ? (
                <Pressable accessibilityRole="button" onPress={card.detail.onPress} style={styles.mini}>
                  <Text style={styles.miniText}>{card.detail.label}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {card.moves.length > 0 ? (
            <View>
              {card.moves.map((move) => (
                <View key={move.key} style={styles.move}>
                  <Text style={styles.moveName}>{move.name}</Text>
                  <Text style={styles.moveDetail}>{move.detail}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: card.main.busy, disabled: card.main.disabled }}
            disabled={card.main.disabled || card.main.busy}
            onPress={card.main.onPress}
            style={[styles.go, card.main.disabled && styles.goOff]}
          >
            {card.main.busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.goText, card.main.disabled && styles.goTextOff]}>{card.main.label}</Text>
            )}
          </Pressable>
          {card.links.length > 0 ? (
            <View style={styles.links}>
              {card.links.map((link) => (
                <Pressable key={link.label} accessibilityRole="button" hitSlop={8} onPress={link.onPress}>
                  <Text style={styles.link}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {more.length > 0 ? (
          <View style={styles.rows}>
            {more.map((row, index) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                onPress={row.onPress}
                style={[styles.row, index > 0 && styles.rowLine]}
              >
                <Text style={styles.rowTitle}>{row.title}</Text>
                {row.detail ? (
                  <Text numberOfLines={1} style={styles.rowDetail}>
                    {row.detail}
                  </Text>
                ) : null}
                <CaretRightIcon color={colors.textDisabled} height={16} width={16} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, paddingBottom: 110, paddingHorizontal: 24, width: '100%' },
    hero: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    heroText: { flex: 1, minWidth: 0 },
    heroSide: { alignItems: 'flex-end', gap: 8 },
    // The pill sits on the middle of the headline's first line (40 high).
    kind: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      height: 36,
      marginTop: 2,
      paddingLeft: 14,
      paddingRight: 10,
    },
    kindText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    line: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 15,
      lineHeight: 22,
      marginTop: -4,
    },
    error: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 20,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    errorText: { color: colors.textPrimary, flex: 1, fontSize: 13.5, lineHeight: 20 },
    errorRetry: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },

    card: { backgroundColor: colors.surface, borderRadius: 28, gap: 14, paddingHorizontal: 22, paddingVertical: 20 },
    factRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 34 },
    facts: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },
    mini: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      height: 34,
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    miniText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    move: {
      alignItems: 'center',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 52,
      paddingVertical: 10,
    },
    moveName: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 22 },
    moveDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    go: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 54,
      paddingHorizontal: 24,
    },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 15, lineHeight: 21 },
    goTextOff: { color: colors.textDisabled },
    links: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
    link: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },

    // The same inner edge as the card above, so the two lists start on one line.
    rows: { backgroundColor: colors.surface, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 4 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 56, paddingVertical: 8 },
    rowLine: { borderTopColor: colors.border, borderTopWidth: 1 },
    rowTitle: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 21 },
    rowDetail: { color: colors.textSecondary, flexShrink: 1, fontSize: 12.5, lineHeight: 18 },
  } as const;
}
