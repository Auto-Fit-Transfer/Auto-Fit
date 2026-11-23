import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import BackIcon from '@/assets/icons/ui/caret-left.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';

// Renewal A's workout record (a-record.html): the app's 내 운동 and 진행 현황 as one screen. One period rules it
// all: my goal, how much I moved against it (a bar a day, or a week), three sums, then the list. A bar picks that
// day's list; a workout opens a sheet with its moves and what goes into the next one. A view that only shows what
// it is given; app/exercise/history.tsx fills it.
export type RecordMetric = 'minutes' | 'workouts' | 'runningMinutes';
const METRICS: [RecordMetric, string][] = [['minutes', '운동 시간'], ['workouts', '운동 횟수'], ['runningMinutes', '러닝 시간']];
const PLOT = 110;

export interface RecordViewProps {
  period: 'week' | 'month';
  range: string;
  canForward: boolean;
  goal: string | null; // "체력 기르기 · 주 90분 · 주 3번"
  metric: RecordMetric;
  value: string; // "120분"
  left: string; // "목표 90분 · 목표 달성" or ''
  bars: { key: string; label: string; value: number; text: string; now: boolean; picked: boolean; name: string }[];
  top: number;
  line: { value: number; label: string } | null;
  sums: [string, string][];
  listTitle: string;
  showAll: boolean;
  rows: { key: string; title: string; sub: string; stopped: boolean }[];
  loading: boolean;
  error: { text: string; onRetry: () => void } | null;
  sheet: {
    title: string;
    lead: string;
    moves: { name: string; text: string; skipped: boolean }[];
    tell: string | null; // what the rules saw, once the analysis is in
    next: string[];
    save: { label: string; disabled: boolean; onPress: () => void } | null;
    note: string | null; // why it cannot be saved, or why the analysis is missing
  } | null;
  onBack: () => void;
  onPeriod: (period: 'week' | 'month') => void;
  onMove: (step: -1 | 1) => void;
  onGoal: () => void;
  onMetric: (metric: RecordMetric) => void;
  onBar: (key: string) => void;
  onAll: () => void;
  onRow: (key: string) => void;
  onCloseSheet: () => void;
}

export function RecordView(props: RecordViewProps) {
  const { period, range, canForward, goal, metric, value, left, bars, top, line, sums, listTitle, showAll, rows, loading, error, sheet } = props;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const picked = bars.some((bar) => bar.picked);
  const seg = <T extends string>(list: [T, string][], chosen: T, onPick: (value: T) => void, wide = false) => (
    <View style={[styles.seg, wide && styles.segWide]}>
      {list.map(([key, label]) => (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen === key }} key={key} onPress={() => onPick(key)} style={[styles.segItem, wide && styles.segItemWide, chosen === key && styles.on]}>
          <Text style={[styles.segText, chosen === key && styles.onText]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={props.onBack} title="운동 기록" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          {seg([['week', '주간'], ['month', '월간']], period, props.onPeriod)}
          <View style={styles.nav}>
            <Pressable accessibilityLabel="이전 기간" accessibilityRole="button" hitSlop={6} onPress={() => props.onMove(-1)} style={styles.navButton}>
              <BackIcon color={colors.ink} height={14} width={14} />
            </Pressable>
            <Text style={styles.range}>{range}</Text>
            <Pressable accessibilityLabel="다음 기간" accessibilityRole="button" accessibilityState={{ disabled: !canForward }} disabled={!canForward} hitSlop={6} onPress={() => props.onMove(1)} style={[styles.navButton, !canForward && styles.navOff]}>
              <View style={styles.flip}>
                <BackIcon color={colors.ink} height={14} width={14} />
              </View>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.wait}>
            <ALoading />
          </View>
        ) : error ? (
          <Pressable accessibilityRole="button" onPress={error.onRetry} style={styles.card}>
            <Text style={styles.body}>{error.text} · 다시 시도</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.aim}>
                <Text numberOfLines={2} style={styles.note}>
                  {goal ?? '아직 정한 운동 목표가 없어요'}
                </Text>
                <Pressable accessibilityRole="link" hitSlop={8} onPress={props.onGoal}>
                  <Text style={styles.link}>{goal ? '목표 고치기' : '목표 정하기'}</Text>
                </Pressable>
              </View>
              {seg(METRICS, metric, props.onMetric, true)}
              <View style={styles.hl}>
                <Text style={styles.big}>{value}</Text>
                {left ? <Text style={styles.note}>{left}</Text> : null}
              </View>

              <View style={styles.chart}>
                <View style={styles.plot}>
                  {bars.map((bar) => {
                    const height = bar.value > 0 ? Math.max(4, Math.round((bar.value / top) * PLOT)) : 0;
                    return (
                      <Pressable accessibilityLabel={`${bar.name} ${bar.text}`} accessibilityRole="button" accessibilityState={{ selected: bar.picked }} key={bar.key} onPress={() => props.onBar(bar.key)} style={styles.col}>
                        {bar.value > 0 ? <Text numberOfLines={1} style={styles.n}>{bar.text}</Text> : null}
                        {height ? <View style={[styles.bar, { height }, picked && !bar.picked && styles.barOff]} /> : null}
                      </Pressable>
                    );
                  })}
                  {line ? (
                    <View pointerEvents="none" style={[styles.gline, { bottom: Math.round((line.value / top) * PLOT) }]}>
                      <Svg height={2} width="100%">
                        <Line stroke={colors.textSecondary} strokeDasharray="5 4" strokeWidth={2} x1="0" x2="100%" y1="1" y2="1" />
                      </Svg>
                      <Text style={styles.gtag}>{line.label}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.labels}>
                  {bars.map((bar) => (
                    <Text key={bar.key} style={[styles.wd, bar.now && styles.wdNow]}>
                      {bar.now && period === 'week' ? '오늘' : bar.label}
                    </Text>
                  ))}
                </View>
              </View>

              <View style={styles.sums}>
                {sums.map(([name, text], index) => (
                  <View key={name} style={[styles.sum, index > 0 && styles.sumLine]}>
                    <Text style={styles.note}>{name}</Text>
                    <Text style={styles.sumValue}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.head}>
              <Text style={styles.note}>{listTitle}</Text>
              {showAll ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={props.onAll}>
                  <Text style={styles.link}>전체 보기</Text>
                </Pressable>
              ) : null}
            </View>
            {rows.length ? (
              <View style={[styles.card, styles.list]}>
                {rows.map((row, index) => (
                  <Pressable accessibilityRole="button" key={row.key} onPress={() => props.onRow(row.key)} style={[styles.row, index > 0 && styles.rowLine]}>
                    <View style={styles.grow}>
                      <Text numberOfLines={1} style={styles.body}>
                        {row.title}
                      </Text>
                      <Text style={styles.note}>{row.sub}</Text>
                    </View>
                    {row.stopped ? <Text style={styles.stop}>중단</Text> : null}
                    <View style={styles.flip}>
                      <BackIcon color={colors.textSecondary} height={16} width={16} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.note, styles.none]}>이 기간에 한 운동이 없어요</Text>
            )}
          </>
        )}
      </ScrollView>

      <AppBottomSheet onClose={props.onCloseSheet} scrollable="when-overflow" title={sheet?.title} visible={Boolean(sheet)}>
        {sheet ? (
          <View style={styles.sheet}>
            <Text style={styles.note}>{sheet.lead}</Text>
            <View>
              {sheet.moves.map((move, index) => (
                <View key={`${move.name}-${index}`} style={[styles.move, index > 0 && styles.rowLine]}>
                  <Text numberOfLines={1} style={[styles.body, styles.grow, move.skipped && styles.dim]}>
                    {move.name}
                  </Text>
                  <Text style={styles.note}>{move.text}</Text>
                </View>
              ))}
            </View>
            {sheet.tell ? <Text style={styles.body}>{sheet.tell}</Text> : null}
            {sheet.next.length ? (
              <View style={styles.next}>
                <Text style={styles.q}>다음 운동에 반영해요</Text>
                {sheet.next.map((line) => (
                  <Text key={line} style={styles.body}>
                    · {line}
                  </Text>
                ))}
              </View>
            ) : null}
            {sheet.note ? <Text style={styles.note}>{sheet.note}</Text> : null}
            {sheet.save ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: sheet.save.disabled }}
                disabled={sheet.save.disabled}
                onPress={sheet.save.onPress}
                style={({ pressed }) => [styles.go, styles.ghost, pressed && styles.goPressed]}
              >
                <Text style={styles.ghostText}>{sheet.save.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
    grow: { flex: 1, minWidth: 0 },
    note: a.note,
    q: { ...a.p15, color: colors.ink },
    body: { ...a.p15, color: colors.ink },
    dim: { color: colors.textSecondary },
    link: a.link,
    flip: { transform: [{ rotate: '180deg' }] },

    top: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    seg: { flexDirection: 'row', gap: 6 },
    segWide: { marginTop: 12 },
    // not a.seg: its flex would squeeze the two short ones (flex 0 collapses a button on the web)
    segItem: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 38, justifyContent: 'center', paddingHorizontal: 14 },
    segItemWide: { flex: 1, paddingHorizontal: 4 },
    segText: { ...a.p12, color: colors.ink },
    on: a.segOn,
    onText: a.onText,
    nav: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    navButton: { ...a.mini, paddingHorizontal: 0, width: 32 },
    navOff: { opacity: 0.35 },
    range: { ...a.p12, color: colors.ink, minWidth: 104, textAlign: 'center' },

    wait: { height: 420 },
    card: { ...a.card, paddingHorizontal: 14, paddingVertical: 14 },
    aim: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    hl: { alignItems: 'baseline', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 16 },
    big: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 36, lineHeight: 40 },

    // the chart: a column a day (or a week), every bar from the same zero line; letters stay ink, never the bar's colour
    chart: { marginTop: 10 },
    plot: { borderBottomColor: colors.ink, borderBottomWidth: 2, flexDirection: 'row', height: PLOT + 22 },
    col: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
    n: { ...a.p12, color: colors.ink, marginBottom: 2 },
    bar: { backgroundColor: colors.primary, borderColor: colors.border, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1, width: 22 },
    barOff: { backgroundColor: colors.primaryLight },
    gline: { height: 2, left: 0, position: 'absolute', right: 0 },
    gtag: { ...a.p12, backgroundColor: colors.surface, bottom: 3, color: colors.textSecondary, paddingHorizontal: 3, position: 'absolute', right: 0 },
    labels: { flexDirection: 'row', marginTop: 4 },
    wd: { ...a.p12, color: colors.textSecondary, flex: 1, textAlign: 'center' },
    wdNow: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold },

    sums: { borderTopColor: colors.track, borderTopWidth: 2, flexDirection: 'row', marginTop: 14, paddingTop: 12 },
    sum: { alignItems: 'center', flex: 1, gap: 2 },
    sumLine: { borderLeftColor: colors.track, borderLeftWidth: 2 },
    sumValue: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },

    head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
    list: { paddingVertical: 2 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 60, paddingVertical: 8 },
    rowLine: { borderTopColor: colors.track, borderTopWidth: 2 },
    stop: { ...a.p12, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, paddingHorizontal: 6 },
    none: { paddingVertical: 24, textAlign: 'center' },

    sheet: { gap: 14, paddingBottom: 8 },
    move: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 44, paddingVertical: 8 },
    next: { gap: 4 },
    go: { ...a.go, height: 52 },
    ghost: a.goGhost,
    goPressed: a.goPressed,
    ghostText: { ...a.goText, color: colors.ink },
  } as const;
}
