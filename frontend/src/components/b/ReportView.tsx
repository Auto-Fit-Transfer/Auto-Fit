import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import type { ReportTrend } from '@/src/components/a/ReportViews';
import { Text } from '@/src/components/common';
import { PART_NAMES, PARTS, type WeekCount } from '@/src/features/a/weekReport';
import type { TierLook } from '@/src/features/tier/tierLook';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline, type HeadlinePart } from './Headline';

// Renewal B's report (report.html): one page of story cards, the week said in a few sentences.
// The big headline is how many days I worked out; then what went well, the one thing that fell short,
// the one thing to do next (the black card is the app's own voice), the tier, the slow numbers of four
// weeks, and asking about the week. Every number comes from the week the report screen counted
// (weekReport.ts) and the server's measurements; nothing is said that the server did not give.
export interface ReportViewProps {
  count: WeekCount;
  trend: ReportTrend;
  tier: TierLook | null;
  onBack: () => void;
  onHistory: () => void; // 운동 기록
  onGo: (tab: 'diet' | 'exercise') => void;
  onRecords: () => void; // every measurement, on its own screen
  onUpload: () => void;
  onTier: () => void;
  onAsk: (question: string | null) => void; // null: 물어보기 with nothing typed yet
}

// Worded as the AI's supported score questions (ai contract 1.5), answered from the score itself.
const ASKS = ['지난주보다 좋아졌어?', '다음 주에는 무엇부터 개선해야 해?'];
const won = (value: number) => Math.round(value).toLocaleString('ko-KR');
const signed = (value: number, digits = 0) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;

export function ReportView({ count, trend, tier, onBack, onHistory, onGo, onRecords, onUpload, onTier, onAsk }: ReportViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const minutes = count.days.reduce((sum, day) => sum + (day.minutes ?? 0), 0);
  const headline: HeadlinePart[][] = count.workoutDays
    ? [[{ text: '이번 주는' }], [{ text: `${count.workoutDays}일`, mark: true }, { text: ' 운동했어요' }]]
    : [[{ text: '이번 주는' }], [{ text: '아직 운동 전이에요' }]];
  const done = count.story.find((row) => row.kind === 'done');
  const next = count.story.find((row) => row.kind === 'next');
  const short = count.protein && count.protein.average < count.protein.goal ? count.protein : null;
  const judged = count.days.filter((day) => day.state === 'past' && day.kcal && day.kcalGoal);
  const weights = trend.weight;
  const newest = weights[weights.length - 1];
  const weightChange = weights.length > 1 ? newest.kg - weights[0].kg : null;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.back}>
            <BackIcon color={colors.textPrimary} height={22} width={22} />
          </Pressable>
          <Text style={styles.topTitle}>리포트</Text>
          <Text style={styles.small}>이번 주</Text>
        </View>

        <View style={styles.hero}>
          <Headline lines={headline} />
          <Text style={styles.line}>{count.say}</Text>
        </View>

        {/* the door to the record, as large as what it opens */}
        <Pressable accessibilityRole="button" onPress={onHistory} style={styles.door}>
          <Text style={styles.doorText}>운동 기록</Text>
          <Text style={styles.doorFacts}>
            {count.workoutDays ? `${count.workoutDays}일${minutes ? ` · ${won(minutes)}분` : ''}` : '아직 없어요'}
          </Text>
          <CaretRightIcon color={colors.textPrimary} height={16} width={16} />
        </Pressable>

        {done ? (
          <View style={styles.card}>
            <Text style={styles.label}>잘한 것</Text>
            <Text style={styles.big}>{done.title}</Text>
            <View style={styles.parts}>
              {PARTS.filter((part) => part !== 'full' || count.parts.full.times > 0).map((part) => (
                <View key={part} style={styles.part}>
                  <Text style={styles.small}>{PART_NAMES[part]}</Text>
                  <Text style={[styles.partValue, count.parts[part].times === 0 && styles.muted]}>{count.parts[part].times}번</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {short || count.kept ? (
          <View style={styles.card}>
            <Text style={styles.label}>{short ? '아쉬운 것 하나' : '식단'}</Text>
            {short ? (
              <>
                <Text style={styles.big}>단백질이 조금 모자랐어요</Text>
                <View style={styles.pair}>
                  <Text style={styles.body}>하루 평균 {short.average}g</Text>
                  <Text style={styles.small}>목표 {short.goal}g</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, (short.average / short.goal) * 100)}%` }]} />
                </View>
              </>
            ) : null}
            {count.kept ? (
              <View style={[styles.kept, short && styles.divided]}>
                <Text style={styles.body}>
                  목표 안에서 먹은 날 {count.kept.days}일 <Text style={styles.small}>· 기록을 마친 {count.kept.of}일 중</Text>
                </Text>
                <View style={styles.days}>
                  {count.days.map((day) => {
                    const known = judged.includes(day);
                    const over = known && (day.kcal ?? 0) > (day.kcalGoal ?? 0);
                    return (
                      <View key={day.key} style={styles.dayCol}>
                        <View style={[styles.dayDot, known && (over ? styles.dayOver : styles.dayKept)]} />
                        <Text style={[styles.small, day.state === 'today' && styles.today]}>{day.state === 'today' ? '오늘' : day.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => onGo('diet')} style={styles.soft}>
              <Text style={styles.softText}>식단 보기</Text>
            </Pressable>
          </View>
        ) : null}

        {next ? (
          <View style={[styles.card, styles.ai]}>
            <Text style={[styles.label, styles.onAiMuted]}>다음 한 가지</Text>
            <Text style={[styles.big, styles.onAi]}>{next.title}</Text>
            <Text style={[styles.body, styles.onAiMuted]}>{next.note}</Text>
            {next.go ? (
              <Pressable accessibilityRole="button" onPress={() => onGo(next.go ?? 'exercise')} style={styles.aiButton}>
                <Text style={styles.aiButtonText}>{next.go === 'diet' ? '식단으로' : '운동하러 가기'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {tier ? (
          <Pressable accessibilityRole="button" onPress={onTier} style={styles.card}>
            <View style={styles.pair}>
              <Text style={styles.label}>티어</Text>
              <CaretRightIcon color={colors.textSecondary} height={16} width={16} />
            </View>
            <Text style={styles.big}>{tier.name}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${tier.ratio}%` }]} />
            </View>
            <Text style={styles.small}>{tier.next} {tier.left}</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>천천히 바뀌는 것 · 최근 기록</Text>
          {newest ? (
            <Pressable accessibilityRole="button" onPress={onRecords} style={styles.slow}>
              <View style={styles.slowText}>
                <Text style={styles.small}>체중</Text>
                <Text style={styles.slowValue}>{newest.kg.toFixed(1)}kg</Text>
                {weightChange !== null ? <Text style={styles.small}>{weights.length}번 재는 동안 {signed(weightChange, 1)}kg</Text> : null}
              </View>
              <Spark values={weights.map((row) => row.kg)} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={onUpload} style={styles.soft}>
              <Text style={styles.softText}>인바디 · 검진표 올리기</Text>
            </Pressable>
          )}
          {trend.score ? (
            <View style={[styles.slow, styles.divided]}>
              <View style={styles.slowText}>
                <Text style={styles.small}>건강 점수</Text>
                <Text style={styles.slowValue}>{trend.score.value}점</Text>
                {trend.score.change !== null ? <Text style={styles.small}>지난주보다 {signed(trend.score.change)}점</Text> : null}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>이번 주에 대해 물어보세요</Text>
          <View style={styles.asks}>
            {ASKS.map((question) => (
              <Pressable key={question} accessibilityRole="button" onPress={() => onAsk(question)} style={styles.ask}>
                <Text style={styles.askText}>{question}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => onAsk(null)} style={styles.askMore}>
              <Text style={styles.link}>직접 물어보기</Text>
              <CaretRightIcon color={colors.textPrimary} height={14} width={14} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// The few measurements as a small line, oldest on the left.
function Spark({ values }: { values: number[] }) {
  const { colors } = useAppTheme();
  if (values.length < 2) return null;
  const width = 96;
  const height = 40;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values.map((value, index) => [
    4 + (index / (values.length - 1)) * (width - 8),
    4 + (1 - (value - low) / span) * (height - 8),
  ]);
  const last = points[points.length - 1];
  return (
    <Svg height={height} width={width}>
      <Polyline fill="none" points={points.map((point) => point.join(',')).join(' ')} stroke={colors.textPrimary} strokeWidth={2} />
      <Circle cx={last[0]} cy={last[1]} fill={colors.lilac} r={4} stroke={colors.textPrimary} strokeWidth={1.5} />
    </Svg>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 14, paddingHorizontal: 24, width: '100%' },
    top: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 },
    back: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: -10, width: 44 },
    topTitle: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 17, lineHeight: 24 },
    hero: { gap: 8, paddingTop: 6 },
    line: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 22 },
    door: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 8,
      minHeight: 52,
      paddingHorizontal: 20,
    },
    doorText: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    doorFacts: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
    card: { backgroundColor: colors.surface, borderRadius: 28, gap: 10, paddingHorizontal: 22, paddingVertical: 20 },
    ai: { backgroundColor: colors.aiCard },
    onAi: { color: colors.onAi },
    onAiMuted: { color: colors.onAiMuted },
    label: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    big: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 20, lineHeight: 28 },
    body: { color: colors.textPrimary, fontSize: 14, lineHeight: 21 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    muted: { color: colors.textDisabled },
    today: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    link: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    parts: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingTop: 12 },
    part: { flex: 1, gap: 2 },
    partValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 17, lineHeight: 24 },
    pair: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    track: { backgroundColor: colors.surfaceMuted, borderRadius: 4, height: 8, overflow: 'hidden' },
    fill: { backgroundColor: colors.textPrimary, borderRadius: 4, height: 8 },
    kept: { gap: 12 },
    divided: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12 },
    days: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCol: { alignItems: 'center', gap: 4, minWidth: 30 },
    dayDot: { backgroundColor: colors.surfaceMuted, borderRadius: 7, height: 14, width: 14 },
    // within the goal: black; over: lilac, said in words above, never red
    dayKept: { backgroundColor: colors.textPrimary },
    dayOver: { backgroundColor: colors.lilac },
    soft: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: 16,
    },
    softText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    aiButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.onAi,
      borderRadius: 999,
      justifyContent: 'center',
      marginTop: 4,
      minHeight: 44,
      paddingHorizontal: 20,
    },
    aiButtonText: { color: colors.aiCard, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 14.5, lineHeight: 20 },
    slow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    slowText: { flex: 1, gap: 1 },
    slowValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 30 },
    asks: { gap: 8 },
    ask: { backgroundColor: colors.surfaceMuted, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
    askText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 20 },
    askMore: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, minHeight: 36 },
  } as const;
}
