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
import { Headline } from '@/src/components/b/Headline';

// The two running screens that only show numbers they are given (the screens under app/exercise fill them),
// in renewal B's way (b-running.html): while I run, and the run I just did.

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
        right={loading || missing ? null : (
          <View style={styles.live}>
            <View style={[styles.liveDot, held && styles.liveDotHeld]} />
            <Text style={styles.liveText}>{held ? '일시정지' : '기록 중'}</Text>
          </View>
        )}
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
          {course ? (
            <View style={styles.courseLine}>
              <Text style={styles.courseLeft}>{course.left}</Text>
              <View style={styles.line}>
                <View style={[styles.lineFill, { width: `${course.ratio * 100}%` }]} />
              </View>
            </View>
          ) : null}
          <View style={styles.liveMap}>{map}</View>
          <View style={styles.count}>
            <Text style={[styles.km, held && styles.kmHeld]}>
              {km}
              <Text style={styles.unit}> km</Text>
            </Text>
            <View style={styles.pair}>
              <View style={styles.cell}>
                <Text style={styles.note}>시간</Text>
                <Text style={styles.value}>{clock}</Text>
              </View>
              <View style={[styles.cell, styles.cellNext]}>
                <Text style={styles.note}>평균 페이스</Text>
                <Text style={styles.value}>{pace}</Text>
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
                <Text style={styles.ghostText}>{busy ? '처리 중…' : held ? '계속 달리기' : '일시정지'}</Text>
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

// After a run. One job: the run I just did at a glance - how far in the headline, where (the map), how long
// and how fast, as one block a little above the middle. No calories: the app has no checked way to work them out.
export function RunDoneView({
  loading,
  problem,
  whole,
  path,
  km,
  clock,
  pace,
  courseName,
  leaveLabel,
  onLeave,
}: {
  loading: boolean;
  // Said in place of the record when it cannot be shown; with onRetry it can be tried again.
  problem: { text: string; onRetry?: () => void } | null;
  whole: boolean; // the whole course was run
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
              <View style={styles.okhead}>
                <Headline lines={[[{ text: '오늘은' }], [{ text: `${km}km`, mark: true }, { text: whole ? ' 완주했어요' : ' 달렸어요' }]]} />
                <View style={styles.saved}>
                  <View style={styles.savedDot} />
                  <Text style={styles.savedText}>기록이 저장됐어요</Text>
                </View>
              </View>
              <View style={styles.record}>
                {path.length >= 2 ? <RoutePicture label="달린 길" points={path} style={styles.doneMap} /> : null}
                <View style={styles.numbers}>
                  <View style={[styles.pair, styles.donePair]}>
                    <View style={styles.cell}>
                      <Text style={styles.note}>시간</Text>
                      <Text style={styles.bigValue}>{clock}</Text>
                    </View>
                    <View style={[styles.cell, styles.cellNext]}>
                      <Text style={styles.note}>평균 페이스</Text>
                      <Text style={styles.bigValue}>{pace}</Text>
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
  const big = { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontVariant: ['tabular-nums'] as ['tabular-nums'] } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    note: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    center: { textAlign: 'center' },
    body: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 22, textAlign: 'center' },
    error: { ...a.p12, color: colors.danger, textAlign: 'center' },
    unit: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    pair: { flexDirection: 'row', width: '100%' },
    cell: { flex: 1, gap: 1, paddingHorizontal: 8 },
    cellNext: {},
    go: a.go,
    goLast: { marginBottom: 4 },
    ghost: { backgroundColor: colors.surface },
    ghostText: { ...a.goText, color: colors.textPrimary },
    goPressed: a.goPressed,
    goText: a.goText,
    off: { opacity: 0.4 },
    // ---- while I run: the map is the big thing and follows me ----
    live1: { flexGrow: 1, gap: 12, paddingHorizontal: 20, paddingTop: 4 },
    missing: { flex: 1, justifyContent: 'center', padding: 24 },
    live: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', gap: 7, paddingHorizontal: 13, paddingVertical: 8 },
    liveDot: { backgroundColor: colors.now, borderRadius: 4, height: 8, width: 8 },
    liveDotHeld: { backgroundColor: colors.textDisabled },
    liveText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    courseLine: { gap: 8 },
    courseLeft: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    line: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 5, overflow: 'hidden', width: '100%' },
    lineFill: { backgroundColor: colors.textPrimary, height: '100%' },
    liveMap: { backgroundColor: colors.surfaceMuted, borderRadius: 28, flex: 1, minHeight: 200, overflow: 'hidden' },
    count: { alignItems: 'center', gap: 12 },
    km: { ...big, fontSize: 68, letterSpacing: -2, lineHeight: 76 },
    kmHeld: { opacity: 0.35 },
    value: { ...big, fontSize: 22, lineHeight: 28 },
    notice: { ...a.p12, backgroundColor: colors.surface, borderRadius: 18, color: colors.textPrimary, paddingHorizontal: 16, paddingVertical: 12 },
    acts: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
    half: { flex: 1 },
    // ---- the run I just did: one block a little above the middle ----
    done: { paddingHorizontal: 20 },
    doneBlock: { flexGrow: 1, gap: 14, justifyContent: 'center', paddingBottom: 48 },
    leave: { marginTop: 4 },
    problem: { backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
    okhead: { gap: 6 },
    saved: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 20 },
    savedDot: { backgroundColor: colors.lilac, borderRadius: 5, height: 9, width: 9 },
    savedText: { color: colors.lilacInk, fontSize: 13, lineHeight: 19 },
    record: { ...a.card, overflow: 'hidden' },
    doneMap: { height: 220 },
    numbers: { paddingBottom: 18, paddingHorizontal: 12, paddingTop: 16 },
    donePair: {},
    bigValue: { ...big, fontSize: 22, lineHeight: 28 },
  } as const;
}
