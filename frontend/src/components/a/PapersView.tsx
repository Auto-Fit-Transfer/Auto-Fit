import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import type { PaperNumbers } from '@/src/features/a/paperNumbers';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';
import { PaperReads } from './PaperReads';
import { Headline } from '@/src/components/b/Headline';

export type PaperFilter = 'all' | 'health_checkup' | 'body_composition';
export interface PaperRow {
  id: string;
  kind: string;
  given: string;
}

// 건강 서류 in renewal B's way (b-docs.html): the headline says what my papers do for me (how many numbers
// the recommendations use), the line under it which papers they came from, the numbers in one white card,
// a new paper, then everything I gave. With nothing given yet it is one block a little above the middle.
// No points here: in renewal B the tier is not the main thing. app/health-data-management.tsx fills it.
export function PapersView({
  loading,
  total,
  rows,
  numbers,
  filter,
  newestFirst,
  onAdd,
  onBack,
  onFilter,
  onSort,
}: {
  loading: boolean;
  // Every paper I gave, whatever the tab; `rows` are the ones of the chosen tab in the chosen order.
  total: number;
  rows: PaperRow[];
  numbers: PaperNumbers[];
  filter: PaperFilter;
  newestFirst: boolean;
  onAdd: () => void;
  onBack: () => void;
  onFilter: (filter: PaperFilter) => void;
  onSort: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const used = numbers.reduce((sum, paper) => sum + paper.items.filter((item) => item.value).length, 0);
  const add = (
    <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => [styles.go, pressed && styles.goPressed]}>
      <Text style={styles.goText}>자료 올리기</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="건강 서류" />
      {loading && total === 0 ? (
        <ALoading />
      ) : total === 0 ? (
        <ScrollView contentContainerStyle={[styles.first, { paddingBottom: insets.bottom + 48 }]} showsVerticalScrollIndicator={false}>
          <Headline lines={[[{ text: '건강 서류를' }], [{ text: '올려 볼까요?' }]]} />
          <Text style={styles.lead}>건강검진 결과나 인바디 결과지를 올리면 운동 · 식단 추천이 내 몸에 맞게 바뀌어요</Text>
          <PaperReads style={styles.reads} />
          {add}
          <Text style={styles.tip}>올린 자료는 암호화해서 보관해요</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <Headline lines={used ? [[{ text: '수치 ' }, { text: `${used}가지`, mark: true }, { text: '를' }], [{ text: '추천에 쓰고 있어요' }]] : [[{ text: '올린 자료가' }], [{ text: `${total}건`, mark: true }, { text: ' 있어요' }]]} />
          <Text style={styles.lead}>{used ? `${numbers.map((paper) => `${paper.day} ${paper.kind}`).join(' · ')}에서 읽었어요` : '확인한 수치부터 추천에 써요'}</Text>
          {numbers.length > 0 ? (
            <View style={styles.now}>
              {numbers.map((paper, index) => (
                <View key={paper.kind} style={[styles.paper, index > 0 && styles.paperNext]}>
                  <View style={styles.cells}>
                    {paper.items.map((item, at) => (
                      <View key={item.label} style={[styles.cell, at > 0 && styles.cellNext]}>
                        <Text style={styles.cellLabel}>{item.label}</Text>
                        <Text numberOfLines={1} style={styles.value}>
                          {item.value || '–'}
                          {item.value && item.unit ? <Text style={styles.unit}> {item.unit}</Text> : null}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.source}>
                    {paper.day} {paper.kind}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {add}
          <Text style={styles.tip}>인바디는 한 달에 한 번이면 충분해요</Text>
          <View style={styles.head}>
            <Text style={styles.count}>올린 자료 {total}건</Text>
            <Pressable
              accessibilityLabel={`정렬 바꾸기, 지금은 ${newestFirst ? '최신순' : '오래된순'}`}
              accessibilityRole="button"
              hitSlop={14}
              onPress={onSort}
            >
              <Text style={styles.link}>{newestFirst ? '최신순' : '오래된순'}</Text>
            </Pressable>
          </View>
          <View style={styles.tabs}>
            {(
              [
                ['all', '전체'],
                ['health_checkup', '건강검진'],
                ['body_composition', '인바디'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === value }}
                onPress={() => onFilter(value)}
                style={[styles.tab, filter === value && styles.on]}
              >
                <Text style={[styles.tabText, filter === value && styles.onText]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {rows.length > 0 ? (
            <View style={styles.list}>
              {rows.map((row, index) => (
                <View key={row.id} style={[styles.row, index > 0 && styles.rowNext]}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{row.kind}</Text>
                    <Text style={styles.rowDetail}>{row.given}</Text>
                  </View>
                  <Text style={styles.rowDetail}>확인 완료</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.none}>이 종류의 자료가 없어요</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const note = { ...a.note, fontFamily: fontFamilies.pretendardRegular } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 14, paddingHorizontal: 20, paddingTop: 8 },
    // Nothing given yet: one block a little above the middle, the button right under the words.
    first: { flexGrow: 1, gap: 14, justifyContent: 'center', paddingHorizontal: 20 },
    lead: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 22, marginTop: -4 },
    reads: { ...a.card, paddingHorizontal: 20, paddingVertical: 18 },
    now: { ...a.card, paddingHorizontal: 20, paddingVertical: 6 },
    paper: { paddingBottom: 14, paddingTop: 16 },
    paperNext: { borderTopColor: colors.border, borderTopWidth: 1 },
    cells: { flexDirection: 'row' },
    cell: { alignItems: 'center', flex: 1, gap: 2, minWidth: 0 },
    cellNext: { borderLeftColor: colors.border, borderLeftWidth: 1 },
    cellLabel: note,
    value: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, letterSpacing: -0.4, lineHeight: 28 },
    unit: { ...a.p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    source: { ...note, marginTop: 10, textAlign: 'center' },
    go: a.go,
    goPressed: a.goPressed,
    goText: a.goText,
    tip: { ...note, marginTop: -6, textAlign: 'center' },
    head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 4, marginTop: 10 },
    count: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 15, lineHeight: 21 },
    link: a.link,
    tabs: { flexDirection: 'row', gap: 6, marginTop: -6 },
    tab: { ...a.chip, backgroundColor: colors.surface, height: 38, paddingHorizontal: 16 },
    tabText: a.chipText,
    on: a.on,
    onText: a.onText,
    list: { ...a.card, paddingHorizontal: 20 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64 },
    rowNext: { borderTopColor: colors.border, borderTopWidth: 1 },
    rowCopy: { flex: 1, gap: 2, minWidth: 0 },
    rowTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    rowDetail: note,
    none: { ...note, marginTop: 8, textAlign: 'center' },
  } as const;
}
