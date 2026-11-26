import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import BackIcon from '@/assets/icons/ui/caret-left.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline } from '@/src/components/b/Headline';

import { ALoading } from './ALoading';
import { aForm } from './form';

// The workout record, in renewal B's way (b-record.html): the app's 내 운동 and 진행 현황 as one screen. One period
// rules it all: chosen at the top, the headline says its number, the line under it how far the goal is, the card
// draws it a black bar a day (or a week) with the goal as a dashed line, then the list. A bar picks that day's list;
// a workout opens a sheet with its moves and what goes into the next one. app/exercise/history.tsx fills it.
const VERBS: Record<RecordMetric, string> = { minutes: '움직였어요', workouts: '운동했어요', runningMinutes: '달렸어요' };
export type RecordMetric = 'minutes' | 'workouts' | 'runningMinutes';
const METRICS: [RecordMetric, string][] = [['minutes', '운동 시간'], ['workouts', '운동 횟수'], ['runningMinutes', '러닝 시간']];
const PLOT = 110;

export interface RecordViewProps {
  period: 'week' | 'month';
  range: string;
  when: string; // "이번 주는", "지난주는", "10월은"
  canForward: boolean;
  goal: string | null; // "체력 기르기 · 주 90분 · 주 3번"
  metric: RecordMetric;
  value: string; // "120분"
  left: string; // "목표 90분까지 30분 남았어요", "아직 정한 목표가 없어요" or ''
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
  const { period, range, when, canForward, goal, metric, value, left, bars, top, line, sums, listTitle, showAll, rows, loading, error, sheet } = props;
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
              <BackIcon color={colors.textPrimary} height={18} width={18} />
            </Pressable>
            <Text style={styles.range}>{range}</Text>
            <Pressable accessibilityLabel="다음 기간" accessibilityRole="button" accessibilityState={{ disabled: !canForward }} disabled={!canForward} hitSlop={6} onPress={() => props.onMove(1)} style={[styles.navButton, !canForward && styles.navOff]}>
              <View style={styles.flip}>
                <BackIcon color={colors.textPrimary} height={18} width={18} />
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
            <Headline lines={[[{ text: when }], [{ text: value, mark: true }, { text: ` ${VERBS[metric]}` }]]} />
            <View style={styles.aim}>
              <Text numberOfLines={2} style={styles.lead}>{left}</Text>
              <Pressable accessibilityRole="link" hitSlop={14} onPress={props.onGoal}>
                <Text style={styles.link}>{goal ? '목표 고치기' : '목표 정하기'}</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {seg(METRICS, metric, props.onMetric, true)}

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
              <Text style={styles.q}>{listTitle}</Text>
              {showAll ? (
                <Pressable accessibilityRole="button" hitSlop={14} onPress={props.onAll}>
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
                <Text style={styles.nextTitle}>다음 운동에 반영해요</Text>
                {sheet.next.map((line) => (
                  <Text key={line} style={styles.nextLine}>
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
  const num = { fontFamily: fontFamilies.pretendardBold, fontSize: 12, lineHeight: 16 } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 16, paddingHorizontal: 20, paddingTop: 8 },
    grow: { flex: 1, minWidth: 0 },
    note: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    q: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    body: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 21 },
    lead: { color: colors.textSecondary, flex: 1, fontSize: 14.5, lineHeight: 21 },
    dim: { color: colors.textDisabled },
    link: a.link,
    flip: { transform: [{ rotate: '180deg' }] },

    top: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    seg: { backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', padding: 4 },
    segWide: { backgroundColor: 'transparent', gap: 6, padding: 0 },
    // not a.seg: its flex would squeeze the two short ones (flex 0 collapses a button on the web)
    segItem: { alignItems: 'center', borderRadius: 999, height: 34, justifyContent: 'center', paddingHorizontal: 16 },
    segItemWide: { ...a.chip, height: 38, paddingHorizontal: 14 },
    segText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    on: a.on,
    onText: a.onText,
    nav: { alignItems: 'center', flexDirection: 'row', marginRight: -10 },
    navButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
    navOff: { opacity: 0.25 },
    range: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, fontVariant: ['tabular-nums'] as ['tabular-nums'], lineHeight: 19, minWidth: 100, textAlign: 'center' },

    wait: { height: 420 },
    card: { ...a.card, padding: 20 },
    aim: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: -6, minHeight: 34 },

    // the chart: one measure, one axis from zero, the value on each bar, the goal a dashed line with its name;
    // the bars are black (my record), no judging colours
    chart: { marginTop: 18 },
    plot: { borderBottomColor: colors.border, borderBottomWidth: 1.5, flexDirection: 'row', height: PLOT + 22 },
    col: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
    n: { ...num, color: colors.textPrimary, marginBottom: 5 },
    bar: { backgroundColor: colors.textPrimary, borderTopLeftRadius: 7, borderTopRightRadius: 7, width: 24 },
    barOff: { backgroundColor: colors.textDisabled },
    gline: { height: 2, left: 0, position: 'absolute', right: 0 },
    gtag: { ...num, backgroundColor: colors.surface, bottom: 4, color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, paddingLeft: 4, position: 'absolute', right: 0 },
    labels: { flexDirection: 'row', marginTop: 6 },
    wd: { ...num, color: colors.textSecondary, flex: 1, fontFamily: fontFamilies.pretendardMedium, textAlign: 'center' },
    wdNow: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold },

    sums: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', marginTop: 18, paddingTop: 16 },
    sum: { flex: 1, gap: 2 },
    sumLine: {},
    sumValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },

    head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: -6, marginTop: 4, minHeight: 34, paddingHorizontal: 4 },
    list: { paddingHorizontal: 20, paddingVertical: 4 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 64, paddingVertical: 10 },
    rowLine: { borderTopColor: colors.border, borderTopWidth: 1 },
    stop: { ...a.p12, backgroundColor: colors.surfaceMuted, borderRadius: 99, color: colors.textPrimary, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 2 },
    none: { paddingVertical: 24, textAlign: 'center' },

    sheet: { gap: 14, paddingBottom: 8 },
    move: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 10 },
    next: { backgroundColor: colors.aiCard, borderRadius: 22, gap: 6, padding: 18 },
    nextTitle: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    nextLine: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 21 },
    go: { ...a.go, height: 52 },
    ghost: a.goGhost,
    goPressed: a.goPressed,
    ghostText: { ...a.goText, color: colors.textPrimary },
  } as const;
}
