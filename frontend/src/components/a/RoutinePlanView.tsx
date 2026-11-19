import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretDownIcon from '@/assets/icons/ui/caret-down.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';

// Renewal A's "today's routine, all of it": the name and its numbers, what it was made from, why, the
// days when it is a plan, every move, then the button that starts it. A view that only shows what it is
// given; app/exercise/summary.tsx fills it.
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
  const [open, setOpen] = useState(false);
  const [openMove, setOpenMove] = useState<string | null>(null);
  const mini = (label: string, onPress: () => void, accessibilityLabel?: string) => (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.mini, pressed && styles.miniPressed]}>
      <Text style={styles.miniText}>{label}</Text>
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
            <Text style={[styles.body, styles.center]}>아직 추천 운동이 없어요</Text>
            <Pressable accessibilityRole="button" onPress={onChange} style={({ pressed }) => [styles.go, pressed && styles.goPressed]}>
              <Text style={styles.goText}>운동 설정하기</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }
  const Fold = open ? MinusIcon : PlusIcon;

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title={header} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.note}>{routine.source}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {routine.title}
          </Text>
          {routine.subtitle ? <Text style={styles.sub}>{routine.subtitle}</Text> : null}
          {routine.meta ? <Text style={styles.note}>{routine.meta}</Text> : null}
        </View>

        <View style={styles.made}>
          <Text numberOfLines={2} style={styles.madeText}>
            {routine.made}
          </Text>
          {mini('바꾸기', onChange)}
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((now) => !now)} style={styles.why}>
          <View style={styles.whyHead}>
            <Text style={[styles.body, styles.grow]}>이렇게 골랐어요</Text>
            <Fold color={colors.ink} height={20} width={20} />
          </View>
          {(open ? routine.reasons : routine.reasons.slice(0, 1)).map((reason, index) => (
            <Text key={index} numberOfLines={open ? undefined : 1} style={styles.sub}>
              {open ? `· ${reason}` : reason}
            </Text>
          ))}
        </Pressable>

        {routine.days.length ? (
          <View style={styles.block}>
            <Text style={styles.body}>이번 추천의 운동 일정</Text>
            <Text style={styles.note}>예정일이 되면 시작할 수 있어요.</Text>
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
                  <Text style={styles.dayNote}>{day.date}</Text>
                  <Text style={styles.body}>{day.name}</Text>
                  <Text style={styles.dayNote}>{day.meta}</Text>
                </View>
                <Text style={styles.dayStatus}>{day.status}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.list}>
          <Text style={[styles.body, styles.listTitle]}>{routine.listTitle}</Text>
          {routine.moves.map((move) => {
            // a move opens to its demo clip and how to do it (a-exercise.html), one at a time
            const canOpen = Boolean(move.demo || move.how);
            const shown = canOpen && openMove === move.id;
            return (
              <View key={move.id} style={styles.moveWrap}>
                <View style={styles.move}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canOpen, expanded: shown }}
                    disabled={!canOpen}
                    onPress={() => setOpenMove(shown ? null : move.id)}
                    style={styles.moveHead}
                  >
                    <View style={styles.grow}>
                      <Text style={styles.body}>{move.name}</Text>
                      <Text style={styles.note}>{move.text}</Text>
                    </View>
                    {canOpen ? (
                      <View style={shown ? styles.flip : undefined}>
                        <CaretDownIcon color={colors.ink} height={18} width={18} />
                      </View>
                    ) : null}
                  </Pressable>
                  {move.posture ? mini('자세 촬영', () => onPosture(move.id), `${move.name} 자세 촬영`) : null}
                </View>
                {shown ? (
                  <View style={styles.more}>
                    {move.demo ? <Image accessibilityLabel={`${move.name} 동작 시범`} resizeMode="contain" source={{ uri: move.demo }} style={styles.demo} /> : null}
                    {move.how ? <Text style={styles.sub}>{move.how}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: button.disabled }}
          disabled={button.disabled}
          onPress={onStart}
          style={({ pressed }) => [styles.go, button.disabled && styles.goOff, pressed && styles.goPressed]}
        >
          <Text style={[styles.goText, button.disabled && styles.offText]}>{button.label}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    grow: { flex: 1, minWidth: 0 },
    flip: { transform: [{ rotate: '180deg' }] },
    center: { textAlign: 'center' },
    note: a.note,
    body: { ...a.p15, color: colors.ink },
    sub: { ...a.p12, color: colors.textBody },

    top: { gap: 4 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 30 },

    made: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 14, borderWidth: 2, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8 },
    madeText: { ...a.p12, color: colors.ink, flex: 1 },
    mini: a.mini,
    miniPressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 3 }] },
    miniText: a.miniText,

    why: { ...a.card, gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
    whyHead: { alignItems: 'center', flexDirection: 'row', gap: 10 },

    block: { gap: 8, marginTop: 4 },
    day: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    // the day I am looking at is violet, like every chosen thing
    dayOn: { backgroundColor: colors.primaryLight, boxShadow: `0 4px 0 ${colors.ink}` },
    dayNote: { ...a.p12, color: colors.textBody },
    dayStatus: { ...a.p12, color: colors.ink },

    list: { ...a.card, paddingBottom: 4, paddingHorizontal: 14, paddingTop: 12 },
    listTitle: { paddingBottom: 10 },
    moveWrap: { borderTopColor: colors.track, borderTopWidth: 2 },
    move: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 56, paddingVertical: 10 },
    moveHead: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
    more: { gap: 8, paddingBottom: 12 },
    // the clips are 16:9 on white; shown whole
    demo: { aspectRatio: 16 / 9, backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, width: '100%' },

    // little to say: one bundle, a little above the middle
    empty: { alignItems: 'stretch', flex: 1, gap: 14, justifyContent: 'center', paddingBottom: 120, paddingHorizontal: 16 },
    go: { ...a.go, height: 52, marginTop: 2 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    offText: { color: colors.textDisabled },
  } as const;
}
