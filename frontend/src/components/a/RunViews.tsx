import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RunningCoordinate } from '@/src/api/running';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';
import { RoutePicture } from './RunParts';
import { Hero, type Who } from './sprites';

// Renewal A's two running screens that only show numbers they are given (the screens under
// app/exercise fill them): while I run, and the run I just did.

// While I run: the map is the big thing, then how far in the biggest number, how long and how fast
// under it, and the two buttons. On a course the bar under the distance is how much of it I have run.
export function RunLiveView({
  title,
  loading,
  missing,
  held,
  finished,
  busy,
  map,
  km,
  course,
  clock,
  pace,
  notice,
  error,
  onBack,
  onToggle,
  onEnd,
  onResult,
}: {
  title: string;
  loading: boolean;
  // Said in place of everything when there is no run to show.
  missing: string | null;
  // Paused: nothing is being counted.
  held: boolean;
  // The run is already saved; the only way on is its result.
  finished: boolean;
  busy: boolean;
  map: ReactNode;
  km: string;
  // On a course: how much of it is run (0 to 1) and what is said under the bar.
  course: { ratio: number; left: string } | null;
  clock: string;
  pace: string;
  notice: string | null;
  error: string | null;
  onBack: () => void;
  onToggle: () => void;
  onEnd: () => void;
  onResult: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScreenHeader
        onBack={onBack}
        right={loading || missing ? null : <Text style={[styles.live, held && styles.liveHeld]}>{held ? '일시정지' : '기록 중'}</Text>}
        title={title}
      />
      {loading ? (
        <ALoading />
      ) : missing ? (
        <View style={styles.missing}>
          <Text style={styles.error}>{missing}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.live1, { paddingBottom: Math.max(12, insets.bottom) + 4 }]} showsVerticalScrollIndicator={false}>
          {/* No alignItems on the box: the map's own wrapper is flex: 1, and centring it collapses its width to 0. */}
          <View style={styles.liveMap}>{map}</View>
          <View style={styles.count}>
            <Text style={[styles.km, held && styles.kmHeld]}>
              {km}
              <Text style={styles.unit}> km</Text>
            </Text>
            {course ? (
              <>
                <View style={styles.line}>
                  <View style={[styles.lineFill, { width: `${course.ratio * 100}%` }]} />
                </View>
                <Text style={styles.note}>{course.left}</Text>
              </>
            ) : null}
            <View style={styles.pair}>
              <View style={styles.cell}>
                <Text style={styles.value}>{clock}</Text>
                <Text style={styles.note}>시간</Text>
              </View>
              <View style={[styles.cell, styles.cellNext]}>
                <Text style={styles.value}>{pace}</Text>
                <Text style={styles.note}>평균 페이스</Text>
              </View>
            </View>
          </View>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Text style={[styles.note, styles.center]}>화면을 벗어나거나 앱이 백그라운드로 가면 러닝이 일시정지돼요.</Text>
          {finished ? (
            <Pressable accessibilityRole="button" onPress={onResult} style={({ pressed }) => [styles.go, styles.goLast, pressed && styles.goPressed]}>
              <Text style={styles.goText}>결과 보기</Text>
            </Pressable>
          ) : (
            <View style={styles.acts}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onToggle}
                style={({ pressed }) => [styles.go, styles.ghost, styles.half, busy && styles.off, pressed && styles.goPressed]}
              >
                <Text style={styles.goText}>{busy ? '처리 중…' : held ? '계속 달리기' : '일시정지'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onEnd}
                style={({ pressed }) => [styles.go, styles.half, busy && styles.off, pressed && styles.goPressed]}
              >
                <Text style={styles.goText}>끝내기</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// After a run. One job: the run I just did at a glance - where (the map), how far in the biggest
// number, how long and how fast. My character is small, by the title. No calories: the app has no
// checked way to work them out.
export function RunDoneView({
  who,
  tier,
  loading,
  problem,
  title,
  path,
  km,
  clock,
  pace,
  courseName,
  leaveLabel,
  onLeave,
}: {
  who: Who;
  tier: number;
  loading: boolean;
  // Said in place of the record when it cannot be shown; with onRetry it can be tried again.
  problem: { text: string; onRetry?: () => void } | null;
  title: string;
  path: RunningCoordinate[];
  km: string;
  clock: string;
  pace: string;
  courseName: string | null;
  leaveLabel: string;
  onLeave: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, styles.done, { paddingBottom: Math.max(12, insets.bottom) + 4, paddingTop: insets.top + 16 }]}>
      {loading ? (
        <ALoading />
      ) : (
        <ScrollView contentContainerStyle={styles.doneBlock} showsVerticalScrollIndicator={false}>
          {problem ? (
            <Pressable accessibilityRole="button" disabled={!problem.onRetry} onPress={problem.onRetry} style={styles.problem}>
              <Text style={styles.body}>
                {problem.text}
                {problem.onRetry ? ' · 다시 시도' : ''}
              </Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.titleRow}>
                <Hero frame={1} proud tier={tier} who={who} zoom={0.5} />
                <Text accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
              </View>
              <View style={styles.record}>
                {path.length >= 2 ? <RoutePicture label="달린 길" points={path} style={styles.doneMap} /> : null}
                <View style={styles.numbers}>
                  <Text style={styles.bigKm}>
                    {km}
                    <Text style={styles.unit}> km</Text>
                  </Text>
                  <View style={[styles.pair, styles.donePair]}>
                    <View style={styles.cell}>
                      <Text style={styles.bigValue}>{clock}</Text>
                      <Text style={styles.note}>시간</Text>
                    </View>
                    <View style={[styles.cell, styles.cellNext]}>
                      <Text style={styles.bigValue}>{pace}</Text>
                      <Text style={styles.note}>평균 페이스</Text>
                    </View>
                  </View>
                </View>
              </View>
              {courseName ? <Text style={[styles.note, styles.center]}>{courseName}</Text> : null}
            </>
          )}
          {/* The way out is part of the block, not alone at the foot of the screen with a hole above it. */}
          <Pressable accessibilityRole="button" onPress={onLeave} style={({ pressed }) => [styles.go, styles.leave, pressed && styles.goPressed]}>
            <Text style={styles.goText}>{leaveLabel}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const big = { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontVariant: ['tabular-nums'] as ['tabular-nums'] } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    note: a.note,
    center: { textAlign: 'center' },
    body: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    error: { ...a.p12, color: colors.danger, textAlign: 'center' },
    unit: { ...a.p15, color: colors.textSecondary },
    pair: { borderTopColor: colors.track, borderTopWidth: 2, flexDirection: 'row', paddingTop: 12, width: '100%' },
    cell: { alignItems: 'center', flex: 1, gap: 2 },
    cellNext: { borderLeftColor: colors.track, borderLeftWidth: 2 },
    go: a.go,
    goLast: { marginBottom: 4 },
    ghost: a.goGhost,
    goPressed: a.goPressed,
    goText: a.goText,
    off: { opacity: 0.4 },
    // ---- while I run ----
    live1: { flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingTop: 4 },
    missing: { flex: 1, justifyContent: 'center', padding: 24 },
    live: {
      ...a.p12,
      backgroundColor: colors.primaryLight,
      borderColor: colors.border,
      borderRadius: 99,
      borderWidth: 1,
      color: colors.ink,
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    liveHeld: { backgroundColor: colors.surface, color: colors.textSecondary },
    liveMap: { ...a.card, backgroundColor: colors.primaryLight, flex: 1, minHeight: 200, overflow: 'hidden' },
    count: { ...a.card, alignItems: 'center', gap: 10, paddingBottom: 14, paddingHorizontal: 16, paddingTop: 8 },
    km: { ...big, fontSize: 72, lineHeight: 84 },
    kmHeld: { opacity: 0.35 },
    line: { backgroundColor: colors.track, borderColor: colors.border, borderRadius: 99, borderWidth: 1, height: 14, overflow: 'hidden', width: '100%' },
    lineFill: { backgroundColor: colors.primary, height: '100%' },
    value: { ...big, fontSize: 24, lineHeight: 30 },
    notice: { ...a.p12, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, padding: 10 },
    // 4 taller than its buttons: the ledge they stand on.
    acts: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    half: { flex: 1 },
    // ---- the run I just did: one block in the middle of the height, a little above it ----
    done: { paddingHorizontal: 16 },
    doneBlock: { flexGrow: 1, gap: 12, justifyContent: 'center', paddingBottom: 48 },
    leave: { marginTop: 8 },
    problem: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 12 },
    titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
    title: { ...big, fontSize: 36, lineHeight: 42 },
    record: { ...a.card, overflow: 'hidden' },
    doneMap: { borderBottomColor: colors.ink, borderBottomWidth: 2, height: 240 },
    numbers: { alignItems: 'center', paddingBottom: 22, paddingHorizontal: 14, paddingTop: 18 },
    // How far: the one number this screen is about.
    bigKm: { ...big, fontSize: 88, lineHeight: 98 },
    donePair: { marginTop: 16, paddingTop: 18 },
    bigValue: { ...big, fontSize: 36, lineHeight: 42 },
  } as const;
}
