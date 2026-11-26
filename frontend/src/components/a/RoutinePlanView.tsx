import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretDownIcon from '@/assets/icons/ui/caret-down.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { Headline } from '@/src/components/b/Headline';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';

// Renewal B's "today's routine, all of it" (11/26, the 지금 | 바꾼다면 picture): the routine's name as the
// headline, what it was made from and why in the black card (the reasons as ticks, all shown), the days
// when it is a plan, every move in a white card, then the button that starts it. A view that only shows
// what it is given; app/exercise/summary.tsx fills it.
export interface RoutinePlanProps {
  header: string;
  // null = nothing to show yet (loading says which)
  routine: {
    source: string;
    title: string;
    subtitle: string;
    meta: string; // "45분 · 약 210kcal · 강도 보통"
    made: string; // what I answered: "45분 · 집 · 맨몸 · 컨디션 보통"
    reasons: string[];
    days: { id: string; date: string; name: string; meta: string; status: string; selected: boolean }[];
    listTitle: string;
    moves: { id: string; name: string; text: string; posture: boolean; demo: string | null; how: string | null }[];
  } | null;
  loading: boolean;
  button: { label: string; disabled: boolean };
  onBack: () => void;
  onChange: () => void; // answer the questions again
  onPickDay: (id: string) => void;
  onPosture: (moveId: string) => void;
  onStart: () => void;
}

export function RoutinePlanView({ header, routine, loading, button, onBack, onChange, onPickDay, onPosture, onStart }: RoutinePlanProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [openMove, setOpenMove] = useState<string | null>(null);
  const go = (label: string, disabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.go, disabled && styles.goOff, pressed && styles.pressed]}
    >
      <Text style={[styles.goText, disabled && styles.offText]}>{label}</Text>
    </Pressable>
  );

  if (!routine) {
    return (
      <View style={styles.root}>
        <ScreenHeader onBack={onBack} title={header} />
        {loading ? (
          <ALoading />
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.say, styles.center]}>아직 추천 운동이 없어요</Text>
            {go('운동 설정하기', false, onChange)}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title={header} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.source}>{routine.source}</Text>
          <Headline lines={[[{ text: routine.title, mark: true }]]} />
          {routine.subtitle ? <Text style={styles.say}>{routine.subtitle}</Text> : null}
          {routine.meta ? <Text style={styles.meta}>{routine.meta}</Text> : null}
        </View>

        <View style={styles.ai}>
          <Text style={styles.hello}>이렇게 골랐어요</Text>
          <View style={styles.made}>
            <Text numberOfLines={2} style={styles.madeText}>
              {routine.made}
            </Text>
            <Pressable accessibilityLabel="조건 바꾸기" accessibilityRole="button" hitSlop={5} onPress={onChange} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
              <Text style={styles.pillText}>바꾸기</Text>
            </Pressable>
          </View>
          {routine.reasons.length ? (
            <View style={styles.reasons}>
              {routine.reasons.map((reason, index) => (
                <View key={index} style={styles.reason}>
                  <View style={styles.tick}>
                    <CheckIcon color={colors.lilacInk} height={14} width={14} />
                  </View>
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {routine.days.length ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>이번 추천의 운동 일정</Text>
              <Text style={styles.small}>예정일이 되면 시작할 수 있어요.</Text>
            </View>
            {routine.days.map((day) => (
              <Pressable
                accessibilityLabel={`${day.date} ${day.name}, ${day.meta}, ${day.status}`}
                accessibilityRole="button"
                accessibilityState={{ selected: day.selected }}
                key={day.id}
                onPress={() => onPickDay(day.id)}
                style={[styles.day, day.selected && styles.dayOn]}
              >
                <View style={styles.grow}>
                  <Text style={styles.small}>{day.date}</Text>
                  <Text style={styles.rowTitle}>{day.name}</Text>
                  <Text style={styles.small}>{day.meta}</Text>
                </View>
                <Text style={[styles.dayStatus, day.selected && styles.dayStatusOn]}>{day.status}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.listTitle]}>{routine.listTitle}</Text>
          {routine.moves.map((move) => {
            // a move opens to its demo clip and how to do it, one at a time
            const canOpen = Boolean(move.demo || move.how);
            const shown = canOpen && openMove === move.id;
            const toggle = () => setOpenMove(shown ? null : move.id);
            return (
              <View key={move.id} style={styles.moveWrap}>
                <View style={styles.move}>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOpen, expanded: shown }} disabled={!canOpen} onPress={toggle} style={styles.grow}>
                    <Text style={styles.rowTitle}>{move.name}</Text>
                    <Text style={styles.small}>{move.text}</Text>
                  </Pressable>
                  {move.posture ? (
                    <Pressable accessibilityLabel={`${move.name} 자세 촬영`} accessibilityRole="button" hitSlop={5} onPress={() => onPosture(move.id)} style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
                      <Text style={styles.miniText}>자세 촬영</Text>
                    </Pressable>
                  ) : null}
                  {canOpen ? (
                    <Pressable accessibilityLabel={`${move.name} ${shown ? '접기' : '펼치기'}`} accessibilityRole="button" hitSlop={10} onPress={toggle} style={shown ? styles.flip : undefined}>
                      <CaretDownIcon color={colors.textPrimary} height={18} width={18} />
                    </Pressable>
                  ) : null}
                </View>
                {shown ? (
                  <View style={styles.more}>
                    {move.demo ? <Image accessibilityLabel={`${move.name} 동작 시범`} resizeMode="contain" source={{ uri: move.demo }} style={styles.demo} /> : null}
                    {move.how ? <Text style={styles.how}>{move.how}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {go(button.label, button.disabled, onStart)}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 16, paddingHorizontal: 24, paddingTop: 8 },
    grow: { flex: 1, minWidth: 0 },
    flip: { transform: [{ rotate: '180deg' }] },
    center: { textAlign: 'center' },
    pressed: { opacity: 0.75 },

    hero: { gap: 6 },
    source: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12.5, lineHeight: 18 },
    say: { color: colors.textBody, fontSize: 15, lineHeight: 22 },
    meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    small: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

    // what it was made from and why: the black card, the reasons as ticks
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 14, padding: 20 },
    hello: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    made: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    madeText: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    pill: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
    pillText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    reasons: { borderTopColor: colors.aiLine, borderTopWidth: 1, gap: 12, paddingTop: 14 },
    reason: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
    tick: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 11, height: 22, justifyContent: 'center', marginTop: -1, width: 22 },
    reasonText: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },

    // the days and the moves: white cards
    card: { backgroundColor: colors.surface, borderRadius: 28, paddingBottom: 6, paddingHorizontal: 22, paddingTop: 16 },
    cardHead: { gap: 2, paddingBottom: 12 },
    cardTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    listTitle: { paddingBottom: 12 },
    rowTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    day: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, minHeight: 64, paddingVertical: 10 },
    // the day I am looking at: lilac, like every chosen thing in B
    dayOn: { backgroundColor: colors.lilac, borderRadius: 16, borderTopColor: 'transparent', marginHorizontal: -10, paddingHorizontal: 10 },
    dayStatus: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    dayStatusOn: { color: colors.lilacInk },
    moveWrap: { borderTopColor: colors.border, borderTopWidth: 1 },
    move: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 64, paddingVertical: 10 },
    mini: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 999, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
    miniText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    more: { gap: 8, paddingBottom: 14 },
    // the clips are 16:9 on white; shown whole
    demo: { aspectRatio: 16 / 9, backgroundColor: colors.surface, borderRadius: 14, width: '100%' },
    how: { color: colors.textBody, fontSize: 13.5, lineHeight: 20 },

    // little to say: one bundle, a little above the middle
    empty: { alignItems: 'stretch', flex: 1, gap: 14, justifyContent: 'center', paddingBottom: 120, paddingHorizontal: 24 },
    go: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 56, justifyContent: 'center' },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
    offText: { color: colors.textDisabled },
  } as const;
}
