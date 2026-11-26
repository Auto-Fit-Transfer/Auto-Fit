import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import type { PaperNumbers } from '@/src/features/a/paperNumbers';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';
import { PaperReads } from './PaperReads';

export type PaperFilter = 'all' | 'health_checkup' | 'body_composition';
export interface PaperRow {
  id: string;
  kind: string;
  given: string;
}

// Renewal A's 건강 서류: the numbers of the papers I gave last, the way to give a new one, then
// everything I gave. With nothing given yet it is one block in the middle that asks for the first.
// A view that only shows what it is given; app/health-data-management.tsx fills it from the server.
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
  const add = (bonus: boolean) => (
    <Pressable
      accessibilityLabel={bonus ? '자료 올리기, 15점' : '자료 올리기'}
      accessibilityRole="button"
      onPress={onAdd}
      style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
    >
      <Text style={styles.goText}>자료 올리기</Text>
      {bonus ? <Text style={styles.reward}>+15</Text> : null}
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="건강 서류" />
      {loading && total === 0 ? (
        <ALoading />
      ) : total === 0 ? (
        <ScrollView contentContainerStyle={[styles.first, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            건강검진 결과나 인바디 결과지가 있나요? 올려 주시면 수치를 읽어서 운동 · 식단 추천을 내 몸에 맞게 바꿔 드려요.
          </Text>
          <View style={styles.addRow}>{add(true)}</View>
          <Text style={styles.tip}>올린 자료는 암호화해서 보관해요</Text>
          <PaperReads style={styles.reads} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          {numbers.length > 0 ? (
            <>
              <Text style={styles.q}>최근에 올린 수치</Text>
              <View style={styles.now}>
                {numbers.map((paper, index) => (
                  <View key={paper.kind} style={index > 0 && styles.nowNext}>
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
            </>
          ) : null}
          <View style={numbers.length > 0 && styles.addRow}>{add(false)}</View>
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
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    // Nothing given yet: one block in the middle of the height, a little above it.
    first: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
    intro: { ...a.p15, color: colors.textBody, marginHorizontal: 2 },
    reads: { ...a.card, marginTop: 22, paddingHorizontal: 16, paddingVertical: 14 },
    q: a.q,
    now: { ...a.card, paddingBottom: 12, paddingHorizontal: 8, paddingTop: 16 },
    nowNext: { borderTopColor: colors.track, borderTopWidth: 2, marginTop: 12, paddingTop: 16 },
    cells: { flexDirection: 'row' },
    cell: { alignItems: 'center', flex: 1, minWidth: 0 },
    cellNext: { borderLeftColor: colors.track, borderLeftWidth: 2 },
    cellLabel: a.note,
    value: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 30 },
    unit: { ...a.p12, color: colors.ink },
    source: { ...a.p12, color: colors.ink, marginTop: 10, textAlign: 'center' },
    addRow: { marginTop: 14 },
    go: a.go,
    goPressed: a.goPressed,
    goText: a.goText,
    reward: a.reward,
    // 4 of the space above the tip is the button's ledge.
    tip: { ...a.note, marginTop: 14, textAlign: 'center' },
    head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 2, marginTop: 26 },
    count: a.note,
    link: a.link,
    tabs: { flexDirection: 'row', gap: 6, marginTop: 8, paddingBottom: 3 },
    tab: a.mini,
    tabText: a.miniText,
    on: a.on,
    onText: a.onText,
    list: { ...a.card, marginTop: 10, paddingHorizontal: 16 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64 },
    rowNext: { borderTopColor: colors.track, borderTopWidth: 2 },
    rowCopy: { flex: 1, gap: 2, minWidth: 0 },
    rowTitle: { ...a.p15, color: colors.ink },
    rowDetail: a.note,
    none: { ...a.note, marginTop: 18, textAlign: 'center' },
  } as const;
}
