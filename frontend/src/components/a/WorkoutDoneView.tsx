import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import type { TierLook } from '@/src/features/tier/tierLook';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';
import { Hero, type Who } from './sprites';

// Renewal A's workout result (a-exercise.html #done): what I did is the main thing, my character is small
// beside the title. Stars for going through to the end, then the moves with their sets, the road to the
// next tier, and how it felt. A view that only shows what it is given; app/exercise/completion.tsx fills it.
export type PostCondition = 'very_bad' | 'bad' | 'normal' | 'good' | 'very_good';
const INTENSITIES = [
  { label: '쉬웠어요', value: 2 },
  { label: '적당했어요', value: 3 },
  { label: '힘들었어요', value: 4 },
];
const CHANGES: { label: string; value: PostCondition }[] = [
  { label: '나아졌어요', value: 'good' },
  { label: '그대로예요', value: 'normal' },
  { label: '더 아파요', value: 'bad' },
];
const AREAS = [
  { label: '어깨', value: 'shoulder' },
  { label: '허리', value: 'waist' },
  { label: '무릎', value: 'knee' },
  { label: '발목', value: 'ankle' },
];

export interface WorkoutDoneProps {
  who: Who;
  tierIndex: number;
  title: string; // the routine's name
  finished: boolean; // at least one move was done
  // Went through to the end / skipped nothing. null = not rated (stopped on the way, or no record of it here).
  stars: [boolean, boolean] | null;
  rows: { name: string; text: string }[];
  minutes: number | null;
  kcal: number | null;
  noPoints?: boolean; // the server's +5 rule was not met: the workout is saved, the points are not
  count: number | null; // moves done, shown when the kcal is not known
  tier: TierLook | null;
  difficulty: number | null;
  hadPain: boolean;
  areas: string[];
  change: PostCondition;
  button: { label: string; disabled: boolean };
  onDifficulty: (value: number) => void;
  onHadPain: (value: boolean) => void;
  onToggleArea: (area: string) => void;
  onChange: (value: PostCondition) => void;
  onDone: () => void;
  onBack: () => void;
  onHistory: () => void; // every workout's record, where one can be kept as my routine
  onShare?: () => void; // writing a post with this workout attached
}

export function WorkoutDoneView(props: WorkoutDoneProps) {
  const { who, tierIndex, title, finished, stars, rows, minutes, kcal, count, tier, difficulty, hadPain, areas, change, button, noPoints } = props;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  // My character by the title: cheering and proud by turns.
  const [frame, setFrame] = useState<0 | 1>(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((now) => (now ? 0 : 1)), 380);
    return () => clearInterval(timer);
  }, []);
  const seg = <T,>(list: { label: string; value: T }[], chosen: T | null, onPick: (value: T) => void) => (
    <View style={styles.seg}>
      {list.map(({ label, value }) => (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen === value }} key={label} onPress={() => onPick(value)} style={[styles.option, chosen === value && styles.on]}>
          <Text style={[styles.optionText, chosen === value && styles.onText]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
  const rated: [string, boolean][] = stars ? [['끝까지', stars[0]], ['건너뛰기 없이', stars[1]], ['강도 알려 주기', difficulty !== null]] : [];

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={props.onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.winRow}>
          <Hero frame={frame} proud tier={tierIndex} who={who} zoom={0.5} />
          <Text accessibilityRole="header" style={styles.win}>
            {finished ? '퀘스트 완료!' : '오늘 운동을 마쳤어요'}
          </Text>
        </View>
        {rated.length ? (
          <View accessibilityLabel={`별 ${rated.filter(([, on]) => on).length}개: ${rated.filter(([, on]) => on).map(([name]) => name).join(', ')}`} accessible style={styles.rate}>
            {rated.map(([name, on]) => (
              <View key={name} style={styles.rateItem}>
                <Text style={[styles.star, { color: on ? colors.textPrimary : colors.surfaceMuted }]}>★</Text>
                <Text style={styles.note}>{name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.did}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {rows.map((row, index) => (
            <View key={`${row.name}-${index}`} style={[styles.rec, index > 0 && styles.line]}>
              <Text numberOfLines={1} style={styles.recName}>
                {row.name}
              </Text>
              <Text style={styles.recText}>{row.text}</Text>
            </View>
          ))}
          <View style={[styles.res, rows.length > 0 && styles.line]}>
            <View style={styles.resItem}>
              <Text style={styles.resValue}>{minutes === null ? '—' : `${minutes}분`}</Text>
              <Text style={styles.note}>운동 시간</Text>
            </View>
            <View style={[styles.resItem, styles.resLine]}>
              <Text style={styles.resValue}>{kcal !== null ? `약 ${Math.round(kcal).toLocaleString('ko-KR')}` : count === null ? '—' : `${count}개`}</Text>
              <Text style={styles.note}>{kcal !== null ? 'kcal' : '마친 동작'}</Text>
            </View>
          </View>
        </View>

        {tier ? (
          <View style={styles.sum}>
            <Text style={styles.body}>
              {tier.next} {tier.left}
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${tier.ratio}%` }]} />
              <View style={[styles.barTick, { left: '33.3%' }]} />
              <View style={[styles.barTick, { left: '66.6%' }]} />
            </View>
          </View>
        ) : null}
        {noPoints ? <Text style={styles.note}>운동 기록은 저장됐지만 티어 점수는 지급되지 않았어요.</Text> : null}

        <View style={styles.box}>
          <Text style={styles.body}>오늘 운동은 어땠나요?</Text>
          {seg(INTENSITIES, difficulty, props.onDifficulty)}
          {difficulty === null ? null : (
            <>
              <Text style={[styles.body, styles.ask]}>운동하면서 아픈 곳은 없었나요?</Text>
              {seg([{ label: '없었어요', value: false }, { label: '있었어요', value: true }], hadPain, props.onHadPain)}
              {hadPain ? (
                <>
                  <Text style={styles.note}>아팠던 곳이 있으면 부위와 정도를 골라 다음 운동에 반영해요.</Text>
                  <View style={styles.chips}>
                    {AREAS.map(({ label, value }) => (
                      <Pressable accessibilityRole="button" accessibilityState={{ selected: areas.includes(value) }} key={value} onPress={() => props.onToggleArea(value)} style={[styles.chip, areas.includes(value) && styles.on]}>
                        <Text style={[styles.optionText, areas.includes(value) && styles.onText]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.body, styles.ask]}>지금은 어때요?</Text>
                  {seg(CHANGES, change, props.onChange)}
                </>
              ) : null}
            </>
          )}
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ disabled: button.disabled }} disabled={button.disabled} onPress={props.onDone} style={({ pressed }) => [styles.go, button.disabled && styles.goOff, pressed && styles.goPressed]}>
          <Text style={[styles.goText, button.disabled && styles.offText]}>{button.label}</Text>
        </Pressable>
        <View style={styles.under}>
          <Pressable accessibilityRole="link" hitSlop={14} onPress={props.onHistory}>
            <Text style={styles.link}>운동 기록</Text>
          </Pressable>
          {props.onShare ? (
            <Pressable accessibilityRole="link" hitSlop={14} onPress={props.onShare}>
              <Text style={styles.link}>커뮤니티에 공유</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16 },
    note: a.note,
    body: { ...a.p15, color: colors.textPrimary },
    line: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2 },

    winRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, justifyContent: 'center' },
    win: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 36, lineHeight: 40, marginBottom: 12 },
    rate: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
    rateItem: { alignItems: 'center', gap: 2, width: 104 },
    star: { fontSize: 26, lineHeight: 30 },

    // what I did: a line a move, then the two numbers
    did: { ...a.card, paddingBottom: 18, paddingHorizontal: 16, paddingTop: 16 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 24, lineHeight: 28, marginBottom: 6 },
    rec: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 10 },
    recName: { ...a.p15, color: colors.textPrimary, flexShrink: 1 },
    recText: { ...a.p12, color: colors.textBody },
    res: { flexDirection: 'row', marginTop: 6, paddingTop: 18 },
    resItem: { alignItems: 'center', flex: 1, gap: 2 },
    resLine: { borderLeftColor: colors.surfaceMuted, borderLeftWidth: 2 },
    resValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 36, lineHeight: 42 },

    // the road to the next tier
    sum: { ...a.card, gap: 10, paddingBottom: 16, paddingHorizontal: 14, paddingTop: 12 },
    bar: { backgroundColor: colors.surfaceMuted, borderRadius: 99, height: 16, overflow: 'hidden' },
    barFill: { backgroundColor: colors.primary, bottom: 0, left: 0, position: 'absolute', top: 0 },
    barTick: { backgroundColor: colors.textPrimary, bottom: 0, marginLeft: -1, position: 'absolute', top: 0, width: 2 },

    // how it felt
    box: { ...a.card, gap: 10, paddingHorizontal: 14, paddingVertical: 16 },
    ask: { marginTop: 6 },
    seg: { flexDirection: 'row', gap: 6 },
    option: { ...a.seg, paddingHorizontal: 4 },
    on: a.on,
    optionText: a.segText,
    onText: a.onText,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { ...a.chip, height: 40, paddingHorizontal: 14 },

    go: { ...a.go, height: 52, marginBottom: 4 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    offText: { color: colors.textDisabled },
    under: { flexDirection: 'row', gap: 18, justifyContent: 'center', paddingVertical: 6 },
    link: a.link,
  } as const;
}
