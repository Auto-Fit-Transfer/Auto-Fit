import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import { aForm } from '@/src/components/a/form';
import type { PostCondition } from '@/src/components/a/WorkoutDoneView';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline } from './Headline';

// Renewal B's workout result (exercise.src.html #vDone): the title and where the points stand, the three
// numbers in one card, a line a move, then how it felt in a fold (optional). No muscle model, effect or
// next pick: the server gives none of them. app/exercise/completion.tsx fills it; app/dev/b-done.tsx with samples.
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

export interface DoneViewProps {
  title: string; // the routine's name
  finished: boolean; // at least one move was done
  rows: { name: string; text: string }[];
  minutes: number | null;
  kcal: number | null;
  count: number | null; // moves done, shown when the kcal is not known
  sets: number | null; // sets done; null once the app was closed in between
  tier: { next: string; left: string } | null;
  noPoints?: boolean; // the server's +5 rule was not met: the workout is saved, the points are not
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
  onHistory: () => void;
  onShare?: () => void;
}

export function DoneView(props: DoneViewProps) {
  const { title, finished, rows, minutes, kcal, count, sets, tier, noPoints, difficulty, hadPain, areas, change, button } = props;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [feelOpen, setFeelOpen] = useState(difficulty !== null);
  const saved = noPoints ? '기록은 저장됐지만 티어 점수는 지급되지 않았어요' : tier ? `${tier.next} ${tier.left}` : null;
  const stats = [
    { label: '운동 시간', value: minutes === null ? '—' : String(minutes), unit: minutes === null ? '' : '분' },
    kcal !== null
      ? { label: '총 칼로리', value: `약 ${Math.round(kcal).toLocaleString('ko-KR')}`, unit: 'kcal' }
      : { label: '마친 동작', value: count === null ? '—' : String(count), unit: count === null ? '' : '개' },
    ...(sets === null ? [] : [{ label: '세트 수', value: String(sets), unit: '세트' }]),
  ];
  const seg = <T,>(list: { label: string; value: T }[], chosen: T | null, onPick: (value: T) => void) => (
    <View style={styles.seg}>
      {list.map(({ label, value }) => (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen === value }} key={label} onPress={() => onPick(value)} style={[styles.option, chosen === value && styles.on]}>
          <Text style={[styles.optionText, chosen === value && styles.onText]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityLabel="운동 홈으로" accessibilityRole="button" onPress={props.onBack} style={styles.round}>
          <CaretLeftIcon color={colors.textPrimary} height={22} width={22} />
        </Pressable>
        <View style={styles.head}>
          <Headline lines={finished ? [[{ text: title }], [{ text: '끝냈어요' }]] : [[{ text: '오늘 운동을' }], [{ text: '마쳤어요' }]]} />
          {saved ? (
            <View style={styles.saved}>
              <View style={styles.dot} />
              <Text style={styles.savedText}>{saved}</Text>
            </View>
          ) : null}
        </View>

        <View accessibilityLabel={stats.map((stat) => `${stat.label} ${stat.value}${stat.unit}`).join(', ')} accessible style={[styles.card, styles.sum]}>
          {stats.map((stat, index) => (
            <View key={stat.label} style={[styles.sumItem, index > 0 && styles.sumLine]}>
              <Text style={styles.small}>{stat.label}</Text>
              <Text style={styles.sumValue}>
                {stat.value}
                {stat.unit ? <Text style={styles.sumUnit}> {stat.unit}</Text> : null}
              </Text>
            </View>
          ))}
        </View>

        {rows.length ? (
          <View style={[styles.card, styles.recs]}>
            <Text style={styles.small}>운동별 기록</Text>
            {rows.map((row, index) => (
              <View key={`${row.name}-${index}`} style={[styles.rec, index > 0 && styles.line]}>
                <Text numberOfLines={1} style={styles.recName}>{row.name}</Text>
                <Text style={styles.recText}>{row.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.fold}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: feelOpen }} onPress={() => setFeelOpen((open) => !open)} style={styles.foldHead}>
            <Text style={styles.foldTitle}>
              오늘 운동은 어땠나요?<Text style={styles.foldOptional}>  선택</Text>
            </Text>
            <Text style={styles.pm}>{feelOpen ? '−' : '+'}</Text>
          </Pressable>
          {feelOpen ? (
            <View style={styles.foldBody}>
              <Text style={styles.ask}>오늘 강도는 어땠나요?</Text>
              {seg(INTENSITIES, difficulty, props.onDifficulty)}
              {difficulty === null ? null : (
                <>
                  <Text style={[styles.ask, styles.askNext]}>운동하면서 아픈 곳은 없었나요?</Text>
                  {seg([{ label: '없었어요', value: false }, { label: '있었어요', value: true }], hadPain, props.onHadPain)}
                  {hadPain ? (
                    <>
                      <Text style={[styles.ask, styles.askNext]}>어디가 아팠나요?</Text>
                      <View style={styles.chips}>
                        {AREAS.map(({ label, value }) => (
                          <Pressable accessibilityRole="button" accessibilityState={{ selected: areas.includes(value) }} key={value} onPress={() => props.onToggleArea(value)} style={[styles.chip, areas.includes(value) && styles.on]}>
                            <Text style={[styles.optionText, areas.includes(value) && styles.onText]}>{label}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[styles.ask, styles.askNext]}>지금은 어때요?</Text>
                      {seg(CHANGES, change, props.onChange)}
                      <Text style={styles.small}>고른 내용은 다음 운동에 반영해요.</Text>
                    </>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={props.onHistory} style={styles.ghost}>
            <Text style={styles.ghostText}>운동 기록</Text>
          </Pressable>
          {props.onShare ? (
            <Pressable accessibilityRole="button" onPress={props.onShare} style={styles.ghost}>
              <Text style={styles.ghostText}>커뮤니티에 공유</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: button.disabled }} disabled={button.disabled} onPress={props.onDone} style={({ pressed }) => [styles.go, button.disabled && styles.goOff, pressed && styles.goPressed]}>
          <Text style={[styles.goText, button.disabled && styles.offText]}>{button.label}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 16, paddingHorizontal: 24 },
    round: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    head: { gap: 6, paddingTop: 4 },
    saved: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 20 },
    dot: { backgroundColor: colors.lilac, borderRadius: 5, height: 9, width: 9 },
    savedText: { color: colors.lilacInk, flexShrink: 1, fontSize: 13, lineHeight: 19 },
    small: { ...a.p12, color: colors.textSecondary },
    card: a.card,
    sum: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 18 },
    sumItem: { alignItems: 'center', flex: 1, gap: 2 },
    sumLine: { borderLeftColor: colors.border, borderLeftWidth: 1 },
    sumValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 24, lineHeight: 32 },
    sumUnit: { fontFamily: fontFamilies.pretendardBold, fontSize: 12.5 },
    recs: { paddingBottom: 6, paddingHorizontal: 22, paddingTop: 18 },
    rec: { gap: 2, paddingVertical: 13 },
    line: { borderTopColor: colors.border, borderTopWidth: 1 },
    recName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 15, lineHeight: 21 },
    recText: { ...a.p12, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    fold: { backgroundColor: colors.surface, borderRadius: 24 },
    foldHead: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 54, paddingHorizontal: 20 },
    foldTitle: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    foldOptional: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    pm: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 20, lineHeight: 24 },
    foldBody: { gap: 9, paddingBottom: 18, paddingHorizontal: 18 },
    ask: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19, paddingLeft: 4 },
    askNext: { marginTop: 6 },
    seg: { flexDirection: 'row', gap: 6 },
    option: { ...a.seg, paddingHorizontal: 4 },
    on: a.on,
    optionText: a.segText,
    onText: a.onText,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { ...a.chip, height: 40, paddingHorizontal: 16 },
    row: { flexDirection: 'row', gap: 10 },
    ghost: { ...a.go, backgroundColor: colors.surface, flex: 1, height: 52 },
    ghostText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    go: { ...a.go, height: 54 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    offText: { color: colors.textDisabled },
  } as const;
}
