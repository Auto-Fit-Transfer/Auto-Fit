import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { HeroHead, type Who } from './sprites';

// Renewal A's exercise tab: the way back to the lobby and the three kinds on top, my character saying
// why today's routine is what it is, the routine as a card, and the one big button that starts it.
// A view that only shows what it is given; app/(tabs)/exercise.tsx fills it from the server.
export interface ExerciseViewProps {
  who: Who;
  tierIndex: number;
  kinds: { label: string; selected?: boolean; onPress: () => void }[];
  say?: string;
  plan: {
    title: string;
    meta?: string;
    detail?: { label: string; onPress: () => void };
    moves: { key: string; name: string; detail: string }[];
  } | null;
  main: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean };
  links: { label: string; onPress: () => void }[];
  more: { key: string; title: string; detail?: string; onPress: () => void }[];
  error?: { text: string; onRetry: () => void } | null;
  onBack: () => void;
}

export function ExerciseView({ who, tierIndex, kinds, say, plan, main, links, more, error, onBack }: ExerciseViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110, paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bar}>
          <Pressable
            accessibilityLabel="홈으로"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <BackIcon color={colors.ink} height={22} width={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.heading}>
            오늘의 운동
          </Text>
        </View>

        <View style={styles.seg}>
          {kinds.map((kind) => (
            <Pressable
              key={kind.label}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(kind.selected) }}
              onPress={kind.onPress}
              style={({ pressed }) => [styles.segButton, kind.selected && styles.segOn, pressed && styles.pressed]}
            >
              <Text style={styles.segText}>{kind.label}</Text>
            </Pressable>
          ))}
        </View>

        {say ? (
          <View style={styles.ask}>
            <View style={styles.face}>
              <HeroHead tier={tierIndex} who={who} />
            </View>
            <View style={styles.say}>
              <Text style={styles.sayText}>{say}</Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <Pressable accessibilityRole="button" onPress={error.onRetry} style={styles.say}>
            <Text style={styles.sayText}>{error.text} · 다시 시도</Text>
          </Pressable>
        ) : null}

        {plan ? (
          <View style={styles.card}>
            <View style={styles.planHead}>
              <View style={styles.planCopy}>
                <Text style={styles.title}>{plan.title}</Text>
                {plan.meta ? <Text style={styles.small}>{plan.meta}</Text> : null}
              </View>
              {plan.detail ? (
                <Pressable hitSlop={{ bottom: 6, top: 6 }}
                  accessibilityRole="button"
                  onPress={plan.detail.onPress}
                  style={({ pressed }) => [styles.mini, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.miniText}>{plan.detail.label}</Text>
                </Pressable>
              ) : null}
            </View>
            {plan.moves.map((move) => (
              <View key={move.key} style={styles.move}>
                <Text style={styles.moveName}>{move.name}</Text>
                <Text style={styles.small}>{move.detail}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: main.busy, disabled: main.disabled }}
          disabled={main.disabled || main.busy}
          onPress={main.onPress}
          style={({ pressed }) => [styles.go, main.disabled && styles.goOff, pressed && styles.pressed]}
        >
          {main.busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.goText}>{main.label}</Text>}
        </Pressable>

        {links.length > 0 ? (
          <View style={styles.under}>
            {links.map((link) => (
              <Pressable key={link.label} accessibilityRole="button" hitSlop={14} onPress={link.onPress}>
                <Text style={styles.link}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {more.length > 0 ? (
          <View style={[styles.card, styles.rows]}>
            {more.map((row, index) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                onPress={row.onPress}
                style={[styles.row, index > 0 && styles.rowLine]}
              >
                <Text style={styles.rowTitle}>{row.title}</Text>
                {row.detail ? (
                  <Text numberOfLines={1} style={styles.small}>
                    {row.detail}
                  </Text>
                ) : null}
                <CaretRightIcon color={colors.textSecondary} height={16} width={16} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const ledge = `0 4px 0 ${colors.ink}`;
  const soft = '0 4px 0 rgba(32, 35, 63, 0.3)';
  const outline = { backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 2 } as const;
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 14, paddingHorizontal: 16 },
    pressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 4 }] },
    pressedSoft: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 3 }] },

    bar: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 48 },
    back: { ...outline, alignItems: 'center', borderRadius: 14, boxShadow: ledge, height: 44, justifyContent: 'center', width: 44 },
    heading: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },

    seg: { flexDirection: 'row', gap: 6 },
    segButton: { ...outline, alignItems: 'center', borderRadius: 14, boxShadow: soft, flex: 1, height: 46, justifyContent: 'center' },
    // The kind I am on is violet, with the full dark ledge.
    segOn: { backgroundColor: colors.primary, boxShadow: ledge },
    segText: { ...p15, color: colors.ink },

    ask: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    face: {
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 11,
      borderWidth: 2,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    say: { ...outline, borderRadius: 14, flex: 1, paddingHorizontal: 13, paddingVertical: 8 },
    sayText: { ...p15, color: colors.ink },

    card: { ...outline, borderRadius: 18, boxShadow: soft, paddingBottom: 4, paddingHorizontal: 14, paddingTop: 14 },
    planHead: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingBottom: 10 },
    planCopy: { flex: 1, gap: 2, minWidth: 0 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    small: { ...p12, color: colors.textSecondary },
    mini: { ...outline, borderRadius: 10, boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)', height: 32, justifyContent: 'center', paddingHorizontal: 10 },
    miniText: { ...p12, color: colors.ink },
    move: {
      alignItems: 'center',
      borderTopColor: colors.track,
      borderTopWidth: 2,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 48,
      paddingVertical: 10,
    },
    moveName: { ...p15, color: colors.ink, flex: 1 },

    go: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderColor: colors.ink,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: ledge,
      height: 52,
      justifyContent: 'center',
    },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    under: { flexDirection: 'row', gap: 18, justifyContent: 'center' },
    link: { ...p12, color: colors.textSecondary, textDecorationLine: 'underline' },

    rows: { paddingTop: 4 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 52, paddingVertical: 8 },
    rowLine: { borderTopColor: colors.track, borderTopWidth: 2 },
    rowTitle: { ...p15, color: colors.ink, flex: 1 },
  } as const;
}
