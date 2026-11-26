import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Rect, Text as SvgText } from 'react-native-svg';

import CheckIcon from '@/assets/icons/ui/check.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { AppBottomSheet, Text, TextInput } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { PART_NAMES, PARTS, partsOf, type Part, type QuestKey, type WeekCount } from '@/src/features/a/weekReport';
import type { TierLook } from '@/src/features/tier/tierLook';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';
import { Hero, HeroHead, heroWidth, PixelIcon, type Who } from './sprites';

// Renewal A's report, two screens the way a game ends a stage (a-report.html):
// 1. 결산 — my body first (weight and health score), then the week counted up: the days light up along a
//    road and the quests I cleared pile up as the home screen's icons.
// 2. 자세히 — the character's status sheet: the parts I trained, how I ate, and what comes out of it.
// Views that only show what they are given; app/health-report.tsx fills them.

export type ReportTrend = {
  weight: { date: string; kg: number }[]; // oldest first, five at most
  score: { value: number; change: number | null } | null;
};

const QUESTS: Record<QuestKey, { name: string; icon: number }> = {
  walk: { name: '걸음', icon: 4 },
  water: { name: '물', icon: 5 },
  stretch: { name: '스트레칭', icon: 6 },
  meal: { name: '식단 기록', icon: 0 },
  workout: { name: '운동', icon: 1 },
};
const won = (value: number) => Math.round(value).toLocaleString('ko-KR');
const signed = (value: number, digits = 0) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(digits)}`;
const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

// How many of `total` things have arrived: one more every beat, unless the phone asks for less motion.
function useArrivals(total: number, daysFirst: number, still: boolean) {
  const [at, setAt] = useState(still ? total : 0);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active && reduced) setAt(total);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [total]);
  useEffect(() => {
    if (at >= total) return undefined;
    const timer = setTimeout(() => setAt((now) => now + 1), at < daysFirst ? 320 : 110);
    return () => clearTimeout(timer);
  }, [at, daysFirst, total]);
  return Math.min(at, total);
}

function TierLine({ tier }: { tier: TierLook }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.line}>
      <View style={[styles.lineFill, { width: `${tier.ratio}%` }]} />
      <View style={[styles.lineTick, { left: '33.3%' }]} />
      <View style={[styles.lineTick, { left: '66.6%' }]} />
    </View>
  );
}

// The line of the last measurements: a square on each, the newest violet, and under each how much it moved.
function Spark({ values, label }: { values: number[]; label: string }) {
  const { colors } = useAppTheme();
  const low = Math.min(...values);
  const span = Math.max(...values) - low;
  const points = values.map((value, index) => ({
    x: 8 + (index * 136) / (values.length - 1),
    y: span ? 44 - ((value - low) / span) * 36 : 26,
  }));
  return (
    <View accessibilityLabel={label} accessible>
      <Svg height={70} width={156}>
        <Polyline fill="none" points={points.map((point) => `${point.x},${point.y}`).join(' ')} stroke={colors.textPrimary} strokeWidth={2} />
        {points.map((point, index) => (
          <Rect
            fill={index === points.length - 1 ? colors.primary : colors.surface}
            height={8}
            key={index}
            stroke={colors.textPrimary}
            strokeWidth={2}
            width={8}
            x={point.x - 4}
            y={point.y - 4}
          />
        ))}
        {points.slice(1).map((point, index) => (
          <SvgText fill={colors.textSecondary} fontFamily={fontFamilies.pretendardMedium} fontSize={12} key={index} opacity={0.7} textAnchor="middle" x={point.x} y={67}>
            {signed(values[index + 1] - values[index], 1)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      {rows.map(([name, value], index) => (
        <View key={name} style={[styles.plistRow, index > 0 && styles.plistLine]}>
          <Text style={styles.plistName}>{name}</Text>
          <Text style={styles.plistValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export interface ReportSummaryProps {
  who: Who;
  tierIndex: number;
  count: WeekCount;
  trend: ReportTrend;
  tier: TierLook | null;
  still?: boolean; // everything is there at once (pictures of the screen)
  onBack: () => void;
  onRecords: () => void; // every measurement, on its own screen
  onUpload: () => void;
  onTier: () => void;
  onMore: () => void;
  onHistory: () => void;
}

export function ReportSummaryView({ who, tierIndex, count, trend, tier, still = false, onBack, onRecords, onUpload, onTier, onMore, onHistory }: ReportSummaryProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(null);
  const lived = count.days.filter((day) => day.state !== 'later');
  const arrived = useArrivals(lived.length + count.loot.length, lived.length, still);
  const todayAt = count.days.findIndex((day) => day.state === 'today');
  const weights = trend.weight;
  const newest = weights[weights.length - 1];
  const day = open === null ? null : count.days[open];
  const main = day ? (day.exercises.find((name) => Array.isArray(partsOf(name, day.regions))) ?? day.exercises[0]) : undefined;
  const nothing = count.workoutDays === 0 && count.questTotal === 0;

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="이번 주 결산" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.ask}>
          <View style={styles.face}>
            <HeroHead tier={tierIndex} who={who} />
          </View>
          <View style={styles.say}>
            <Text style={styles.sayText}>{count.say}</Text>
          </View>
        </View>

        <View style={styles.trend}>
          {newest ? (
            <View style={styles.chg}>
              <View style={styles.chgCopy}>
                <Text style={styles.note}>{weights.length > 1 ? `체중 · 최근 ${weights.length}번 측정` : `체중 · ${monthDay(newest.date)} 측정`}</Text>
                <Text style={styles.huge}>{newest.kg.toFixed(1)}kg</Text>
                <Text style={styles.body}>
                  {weights.length > 1 ? `${monthDay(weights[0].date)}보다 ${signed(newest.kg - weights[0].kg, 1)}kg` : '변화는 다음 측정부터 보여요'}
                </Text>
              </View>
              {weights.length > 1 ? <Spark label="측정할 때마다의 체중을 이은 선" values={weights.map((point) => point.kg)} /> : null}
            </View>
          ) : null}
          {trend.score ? (
            <View style={[styles.chg, newest && styles.chgLine]}>
              <View style={styles.chgCopy}>
                <Text style={styles.note}>건강 점수</Text>
                <Text style={styles.huge}>{Math.round(trend.score.value)}점</Text>
                {trend.score.change !== null ? <Text style={styles.body}>지난번보다 {signed(trend.score.change)}점</Text> : null}
              </View>
            </View>
          ) : null}
          {newest || trend.score ? (
            <Pressable accessibilityRole="button" onPress={onRecords} style={({ pressed }) => [styles.all, pressed && styles.dim]}>
              <Text style={styles.allText}>측정 기록 전체 보기</Text>
              <CaretRightIcon color={colors.textPrimary} height={18} width={18} />
            </Pressable>
          ) : (
            <View style={styles.nopaper}>
              <Text style={styles.note}>체중 · 건강 점수</Text>
              <Text style={styles.body}>건강 서류를 올리면 여기에 보여요</Text>
              <Pressable hitSlop={{ bottom: 5, top: 5 }} accessibilityRole="button" onPress={onUpload} style={({ pressed }) => [styles.small, pressed && styles.sunk]}>
                <Text style={styles.smallText}>자료 올리기</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.week}>
          <View style={styles.weekHead}>
            <Text style={styles.title}>이번 주 {count.workoutDays}일 운동</Text>
            <Text style={styles.note}>퀘스트 {lived.slice(0, arrived).reduce((sum, item) => sum + item.cleared, 0)}개</Text>
          </View>
          <View style={styles.days}>
            <View style={styles.road} />
            <View style={[styles.road, styles.roadDone, { right: undefined, width: `${(Math.max(0, todayAt) / 6) * 86}%` }]} />
            {count.days.map((item, index) => {
              const here = item.state !== 'later';
              const waiting = here && index >= arrived;
              const dot = (
                <>
                  {item.state === 'today' ? (
                    <View style={styles.mark}>
                      <HeroHead tier={tierIndex} who={who} />
                    </View>
                  ) : null}
                  <View style={[styles.dot, item.state === 'today' && styles.dotNow, item.workout && styles.dotDone, waiting && styles.waiting]}>
                    <Text style={[styles.dotText, item.state === 'today' && styles.dotTextNow, item.workout && styles.dotTextDone]}>{item.label}</Text>
                  </View>
                  <Text style={[styles.note, item.state === 'today' && styles.ink]}>{here && !waiting && item.cleared ? `${item.cleared}개` : ' '}</Text>
                </>
              );
              return here ? (
                <Pressable
                  accessibilityLabel={`${item.label}요일, 깬 퀘스트 ${item.cleared}개${item.workout ? ', 운동한 날' : ''}, 자세히 보기`}
                  accessibilityRole="button"
                  key={item.key}
                  onPress={() => setOpen(index)}
                  style={styles.day}
                >
                  {dot}
                </Pressable>
              ) : (
                <View key={item.key} style={styles.day}>
                  {dot}
                </View>
              );
            })}
          </View>
          <View style={styles.loot}>
            {count.loot.map((item, index) => (
              <View
                accessibilityLabel={`${QUESTS[item.key].name} ${item.count}번`}
                accessible
                key={item.key}
                style={[styles.lootItem, lived.length + index >= arrived && styles.waiting]}
              >
                <View style={[styles.tile, item.count === 0 && styles.tileZero]}>
                  <View style={item.count === 0 && styles.faint}>
                    <PixelIcon index={QUESTS[item.key].icon} />
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.note}>
                  {QUESTS[item.key].name}
                </Text>
                <Text style={[styles.times, item.count === 0 && styles.mute]}>×{item.count}</Text>
              </View>
            ))}
          </View>
        </View>

        {tier ? (
          <Pressable accessibilityLabel={`티어 보기, ${tier.next} ${tier.left}`} accessibilityRole="button" onPress={onTier} style={({ pressed }) => [styles.sum, pressed && styles.sunk]}>
            <Text style={styles.strong}>
              {tier.next} {tier.left}
            </Text>
            <TierLine tier={tier} />
          </Pressable>
        ) : null}

        <View style={styles.two}>
          {nothing ? null : (
            <Pressable accessibilityRole="button" onPress={onMore} style={({ pressed }) => [styles.go, pressed && styles.goPressed]}>
              <Text style={styles.goText}>자세히 보기</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onHistory} style={({ pressed }) => [styles.go, styles.goGhost, pressed && styles.goPressed]}>
            <Text style={[styles.goText, styles.ink]}>운동 기록</Text>
          </Pressable>
        </View>
      </ScrollView>

      <AppBottomSheet onClose={() => setOpen(null)} title={day ? `${day.label}요일` : undefined} visible={day !== null}>
        {day ? (
          <Rows
            rows={[
              ['운동', day.minutes !== null ? `${won(day.minutes)}분${main ? ` · ${main}${day.exercises.length > 1 ? ` 외 ${day.exercises.length - 1}개` : ''}` : ''}` : day.state === 'today' ? '아직 안 했어요' : '쉬는 날'],
              [
                '식단',
                day.kcal
                  ? `${won(day.kcal)}kcal${day.state === 'today' ? ' · 기록 중' : day.kcalGoal ? (day.kcal > day.kcalGoal ? ' · 목표를 넘음' : ' · 목표 안') : ''}`
                  : '기록 없음',
              ],
              ...(day.steps !== null ? [['걸음', `${won(day.steps)}걸음`] as [string, string]] : []),
              ['깬 퀘스트', `${day.cleared}개`],
            ]}
          />
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

export interface ReportDetailProps {
  who: Who;
  tierIndex: number;
  name: string;
  count: WeekCount;
  tier: TierLook | null;
  sheet?: 'ask' | 'food' | Part; // opened from the start (pictures of the screen)
  onBack: () => void;
  onTier: () => void;
  onGo: (tab: 'diet' | 'exercise') => void;
  onAsk: (question: string) => void; // goes to 물어보기 with these words
}

// Worded as the AI's supported score questions (ai contract 1.5), so they are answered from the score itself.
const ASKS = ['지난주보다 좋아졌어?', '다음 주에는 무엇부터 개선해야 해?'];
const STORY = { done: '달성', bonus: '보너스 퀘스트', next: '다음 퀘스트' } as const;
const GO = { diet: '식단', exercise: '운동' } as const;

export function ReportDetailView({ who, tierIndex, name, count, tier, sheet, onBack, onTier, onGo, onAsk }: ReportDetailProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<'ask' | 'food' | Part | null>(sheet ?? null);
  const [question, setQuestion] = useState('');
  const part = open && open !== 'ask' && open !== 'food' ? open : null;
  const judged = count.days.filter((day) => day.state === 'past' && day.kcal && day.kcalGoal);
  const ask = (text: string) => {
    if (!text.trim()) return;
    setOpen(null);
    setQuestion('');
    onAsk(text.trim());
  };
  const stat = (label: string, bar: ReactNode, value: string, onPress: () => void, hint: string) => (
    <Pressable hitSlop={{ bottom: 2, top: 2 }} accessibilityLabel={`${label} ${value}, ${hint}`} accessibilityRole="button" key={label} onPress={onPress} style={({ pressed }) => [styles.st, pressed && styles.dim]}>
      <Text style={styles.stName}>{label}</Text>
      <View style={styles.stBar}>{bar}</View>
      <Text style={styles.stValue}>{value}</Text>
    </Pressable>
  );
  const cells = (on: boolean[]) => (
    <View style={styles.cells}>
      {on.map((lit, index) => (
        <View key={index} style={[styles.cell, lit && styles.cellOn]} />
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="이번 주 자세히" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityLabel="티어 보기" accessibilityRole="button" onPress={onTier} style={({ pressed }) => [styles.who, pressed && styles.sunk]}>
          <View style={styles.port}>
            <View style={[styles.portHero, { marginLeft: -heroWidth(who, 1) / 2 }]}>
              <Hero frame={1} proud tier={tierIndex} who={who} zoom={1} />
            </View>
          </View>
          <View style={styles.whoCopy}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            {tier ? (
              <>
                <View style={styles.level}>
                  <Text style={styles.levelText}>{tier.name}</Text>
                  <Text style={styles.stars}>
                    {[1, 2, 3].map((star) => (
                      <Text key={star} style={{ color: star <= tier.stars ? colors.textPrimary : colors.surfaceMuted }}>
                        ★
                      </Text>
                    ))}
                  </Text>
                </View>
                <TierLine tier={tier} />
                <Text style={styles.note}>
                  {tier.next} {tier.left}
                </Text>
              </>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.stats}>
          <Text style={styles.eyebrow}>운동한 부위</Text>
          {PARTS.map((key) => stat(PART_NAMES[key], cells([0, 1].map((index) => index < count.parts[key].times)), `${count.parts[key].times}번`, () => setOpen(key), '자세히 보기'))}
          <View style={styles.rule} />
          <Text style={styles.eyebrow}>식단</Text>
          {count.protein
            ? stat(
                '단백질',
                <View style={[styles.line, styles.flat]}>
                  <View style={[styles.lineFill, { width: `${Math.min(100, (count.protein.average / count.protein.goal) * 100)}%` }]} />
                </View>,
                `${count.protein.average} / ${count.protein.goal}g`,
                () => setOpen('food'),
                '하루 평균, 자세히 보기',
              )
            : null}
          {count.kept ? stat('목표 안 식사', cells(judged.map((day) => (day.kcal ?? 0) <= (day.kcalGoal ?? 0))), `${count.kept.days} / ${count.kept.of}일`, () => setOpen('food'), '자세히 보기') : null}
          {count.protein || count.kept ? null : <Text style={[styles.note, styles.none]}>식사를 기록한 다음 날부터 보여요</Text>}
        </View>

        {count.story.length ? (
          <View style={styles.story}>
            {count.story.map((row, index) => (
              <View key={row.kind} style={[styles.storyRow, index > 0 && styles.plistLine]}>
                <View style={styles.tile}>
                  {row.kind === 'next' ? <TargetIcon color={colors.textPrimary} height={22} width={22} /> : <PixelIcon index={row.kind === 'bonus' ? 0 : 1} />}
                </View>
                <View style={styles.storyCopy}>
                  <Text style={styles.eyebrow}>{STORY[row.kind]}</Text>
                  <Text style={styles.strong}>{row.title}</Text>
                  <Text style={styles.note}>{row.note}</Text>
                </View>
                {row.reward ? <Text style={styles.reward}>+{row.reward}</Text> : null}
                {row.go ? (
                  <Pressable
                    accessibilityLabel={`${GO[row.go]} 화면으로`}
                    accessibilityRole="button"
                    hitSlop={6}
                    onPress={() => onGo(row.go as 'diet' | 'exercise')}
                    style={({ pressed }) => [styles.small, styles.smallOn, pressed && styles.sunk]}
                  >
                    <Text style={[styles.smallText, styles.onText]}>{GO[row.go]}</Text>
                  </Pressable>
                ) : (
                  <CheckIcon color={colors.primaryText} height={22} width={22} />
                )}
              </View>
            ))}
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => setOpen('ask')} style={({ pressed }) => [styles.wide, pressed && styles.goPressed]}>
          <Text style={[styles.goText, styles.ink]}>궁금한 것 물어보기</Text>
        </Pressable>
      </ScrollView>

      <AppBottomSheet onClose={() => setOpen(null)} title={part ? `${PART_NAMES[part]} 이번 주` : undefined} visible={part !== null}>
        {part ? (
          Object.keys(count.parts[part].names).length ? (
            <>
              <Rows rows={Object.entries(count.parts[part].names).map(([exercise, times]) => [exercise, `${times}번`])} />
              <Text style={[styles.note, styles.sheetNote]}>{count.parts[part].days.map((label) => `${label}요일`).join(' · ')}에 했어요</Text>
            </>
          ) : (
            <Text style={styles.body}>이번 주에 한 동작이 아직 없어요</Text>
          )
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet onClose={() => setOpen(null)} title="이번 주 식단" visible={open === 'food'}>
        {count.protein ? (
          <View style={styles.food}>
            <View style={styles.pn}>
              <Text style={styles.body}>하루 평균 단백질 {count.protein.average}g</Text>
              <Text style={styles.note}>목표 {count.protein.goal}g</Text>
            </View>
            <View style={[styles.line, styles.flat]}>
              <View style={[styles.lineFill, { width: `${Math.min(100, (count.protein.average / count.protein.goal) * 100)}%` }]} />
            </View>
          </View>
        ) : null}
        {count.kept ? (
          <View style={styles.pn}>
            <Text style={styles.body}>목표 안에서 먹은 날 {count.kept.days}일</Text>
            <Text style={styles.note}>기록을 마친 {count.kept.of}일 중</Text>
          </View>
        ) : null}
        <View style={styles.dots}>
          {count.days.map((item) => {
            const eaten = item.state === 'past' && !!item.kcal && !!item.kcalGoal;
            const over = eaten && (item.kcal ?? 0) > (item.kcalGoal ?? 0);
            return (
              <View key={item.key} style={styles.dotsDay}>
                <View style={[styles.box, item.state === 'today' ? styles.boxNow : over ? styles.boxOver : eaten ? styles.boxIn : null]}>
                  <Text style={[styles.dotText, eaten && !over && styles.boxInText, item.state === 'today' && styles.ink]}>{item.label}</Text>
                </View>
                <Text style={styles.note}>{item.state === 'today' ? '오늘' : over ? '넘음' : ' '}</Text>
              </View>
            );
          })}
        </View>
      </AppBottomSheet>

      <AppBottomSheet onClose={() => setOpen(null)} title="무엇이 궁금해요?" visible={open === 'ask'}>
        <View style={styles.opts}>
          {ASKS.map((text) => (
            <Pressable accessibilityRole="button" key={text} onPress={() => ask(text)} style={({ pressed }) => [styles.opt, pressed && styles.dim]}>
              <Text style={styles.body}>{text}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.send}>
          <View style={styles.field}>
            <TextInput
              accessibilityLabel="직접 물어볼 말"
              maxLength={500}
              onChangeText={setQuestion}
              onSubmitEditing={() => ask(question)}
              placeholder="직접 물어보기"
              placeholderTextColor={colors.textDisabled}
              returnKeyType="send"
              style={styles.input}
              value={question}
            />
          </View>
          <Pressable hitSlop={{ bottom: 5, top: 5 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !question.trim() }}
            disabled={!question.trim()}
            onPress={() => ask(question)}
            style={({ pressed }) => [styles.small, styles.sendGo, question.trim() ? styles.smallOn : styles.smallOff, pressed && styles.sunk]}
          >
            <Text style={[styles.smallText, question.trim() ? styles.onText : styles.mute]}>보내기</Text>
          </Pressable>
        </View>
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const flat = '0 0 0 rgba(32, 35, 63, 0.3)';
  const outline = { borderWidth: 1 } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingTop: 4 },
    note: a.note,
    body: { ...a.p15, color: colors.textBody },
    strong: { ...a.p15, color: colors.textPrimary },
    ink: { color: colors.textPrimary },
    mute: { color: colors.textSecondary },
    onText: { color: colors.onPrimary },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 26 },
    huge: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 36, lineHeight: 42 },
    eyebrow: { ...a.p12, color: colors.primaryText },
    dim: { opacity: 0.7 },
    sunk: { boxShadow: flat, transform: [{ translateY: 4 }] },
    waiting: { opacity: 0.25, transform: [{ scale: 0.7 }] },
    faint: { opacity: 0.35 },

    // 결산: the one line my character says
    ask: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    face: { ...outline, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 11, height: 40, justifyContent: 'center', width: 40 },
    say: { ...outline, backgroundColor: colors.surface, borderRadius: 14, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
    sayText: { ...a.p15, color: colors.textPrimary },

    // the slow changes: a number, what it did, the line of the last measurements
    trend: { ...a.card, paddingHorizontal: 14, paddingVertical: 4 },
    chg: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 18 },
    chgLine: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2 },
    chgCopy: { flexShrink: 1, gap: 2 },
    all: { alignItems: 'center', borderTopColor: colors.surfaceMuted, borderTopWidth: 2, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 4 },
    allText: { ...a.p15, color: colors.textPrimary },
    nopaper: { alignItems: 'center', gap: 8, paddingBottom: 30, paddingHorizontal: 4, paddingTop: 30 },

    // the week as a road: a round stop for each day, violet for a day I worked out, my head over today
    week: { ...a.card, paddingHorizontal: 14, paddingVertical: 16 },
    weekHead: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
    days: { flexDirection: 'row', marginTop: 34 },
    road: { backgroundColor: colors.surfaceMuted, height: 4, left: '7%', position: 'absolute', right: '7%', top: 15 },
    roadDone: { backgroundColor: colors.primary },
    day: { alignItems: 'center', flex: 1, gap: 4 },
    dot: { ...outline, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
    dotNow: { backgroundColor: colors.surface, boxShadow: `0 0 0 3px ${colors.primary}` },
    dotDone: { backgroundColor: colors.primary },
    dotText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 12, lineHeight: 14 },
    dotTextNow: { color: colors.textPrimary },
    dotTextDone: { color: colors.onPrimary },
    mark: { position: 'absolute', top: -28 },
    loot: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2, flexDirection: 'row', marginTop: 16, paddingTop: 16 },
    lootItem: { alignItems: 'center', flex: 1 },
    tile: { ...outline, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 44, justifyContent: 'center', marginBottom: 4, width: 44 },
    tileZero: { backgroundColor: colors.surfaceMuted },
    times: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 12, lineHeight: 17 },

    // the road to the next tier
    sum: { ...a.card, gap: 10, paddingBottom: 16, paddingHorizontal: 14, paddingTop: 12 },
    line: { ...outline, backgroundColor: colors.surfaceMuted, borderRadius: 99, height: 16, overflow: 'hidden' },
    lineFill: { backgroundColor: colors.primary, bottom: 0, left: 0, position: 'absolute', top: 0 },
    lineTick: { backgroundColor: colors.textPrimary, bottom: 0, marginLeft: -1, position: 'absolute', top: 0, width: 2 },
    flat: { height: 14 },

    // Right under the week, not pushed to the bottom: on a first day there is little above them.
    two: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    go: { ...a.go, flex: 1, height: 52 },
    goGhost: a.goGhost,
    goPressed: a.goPressed,
    goText: a.goText,
    // Right under what it asks about, not pushed to the bottom: the list above can be short.
    wide: { ...a.go, ...a.goGhost, height: 52, marginBottom: 4 },
    small: { ...a.mini, alignSelf: 'center' },
    smallOn: a.on,
    smallOff: { backgroundColor: colors.surfaceMuted, boxShadow: flat },
    smallText: a.miniText,
    reward: a.reward,

    // 자세히: who I am and how far to the next tier
    who: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 14, paddingBottom: 10, paddingLeft: 10, paddingRight: 16, paddingTop: 10 },
    port: { ...outline, backgroundColor: colors.surfaceMuted, borderRadius: 14, height: 140, overflow: 'hidden', width: 104 },
    // The feet stand clear of the frame; the drawing has that much empty room above the head.
    portHero: { bottom: 10, left: '50%', position: 'absolute' },
    whoCopy: { flex: 1, gap: 6, minWidth: 0 },
    name: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 24, lineHeight: 28 },
    level: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    levelText: { ...a.p12, color: colors.primaryText },
    stars: { fontSize: 12, lineHeight: 15 },

    // the bars: whole things as cells, an amount as a line
    stats: { ...a.card, paddingBottom: 8, paddingHorizontal: 14, paddingTop: 12 },
    st: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 40 },
    stName: { ...a.p15, color: colors.textPrimary, width: 98 },
    stBar: { flex: 1 },
    stValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 12, lineHeight: 17, minWidth: 70, textAlign: 'right' },
    cells: { flexDirection: 'row', gap: 4 },
    cell: { ...outline, backgroundColor: colors.surfaceMuted, borderRadius: 5, flex: 1, height: 16 },
    cellOn: { backgroundColor: colors.primary },
    rule: { backgroundColor: colors.surfaceMuted, height: 2, marginBottom: 10, marginTop: 6 },
    none: { paddingBottom: 8, paddingTop: 6 },

    story: { ...a.card, paddingHorizontal: 14, paddingVertical: 2 },
    storyRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 10 },
    storyCopy: { flex: 1, minWidth: 0 },

    // the boxes
    plistRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 10 },
    plistLine: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2 },
    plistName: { ...a.p15, color: colors.textBody },
    plistValue: { ...a.p15, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
    sheetNote: { marginTop: 6, paddingHorizontal: 4 },
    food: { gap: 8, marginBottom: 18 },
    pn: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
    dots: { flexDirection: 'row', gap: 6, marginTop: 10 },
    dotsDay: { alignItems: 'center', flex: 1, gap: 3 },
    box: { ...outline, alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.surfaceMuted, borderColor: colors.textDisabled, borderRadius: 10, height: 38, justifyContent: 'center' },
    boxIn: { backgroundColor: colors.textPrimary, borderColor: colors.border },
    boxInText: { color: '#FFFFFF' },
    boxOver: { backgroundColor: colors.surface, borderColor: colors.border, borderStyle: 'dashed' },
    boxNow: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    opts: { gap: 8 },
    opt: { ...outline, backgroundColor: colors.surface, borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
    send: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
    field: { ...a.field, flex: 1 },
    input: { ...a.input, flex: 1, padding: 0 },
    sendGo: { height: 48, paddingHorizontal: 14 },
  } as const;
}
