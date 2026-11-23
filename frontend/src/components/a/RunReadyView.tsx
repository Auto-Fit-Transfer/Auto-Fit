import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';
import { KindsBar } from './RunParts';

export type RunTab = 'rec' | 'mine';
export interface RunCourseRow {
  key: string;
  name: string;
  detail: string;
  onPress: () => void;
}

// 러닝 before a run, in renewal B's way (b-running.html; the app has no course picked for me, so it keeps its
// search): a run I left is on top, then the place and the length to look for,
// and the list of courses for them (the ones found, or the ones I kept). Running without a course
// is the line at the foot. A view that only shows what it is given; app/exercise/running.tsx fills it.
export function RunReadyView({
  kinds,
  active,
  region,
  distance,
  distances,
  finding,
  message,
  tab,
  counts,
  rows,
  onBack,
  onRegion,
  onDistance,
  onFind,
  onTab,
  onFree,
}: {
  kinds: { label: string; selected?: boolean; onPress: () => void }[];
  // A run that was left unfinished: what it was and the way back into it.
  active: { detail: string; onResume: () => void } | null;
  region: string;
  distance: string;
  distances: readonly string[];
  finding: boolean;
  message: string;
  tab: RunTab;
  counts: { rec: number; mine: number };
  rows: RunCourseRow[];
  onBack: () => void;
  onRegion: (text: string) => void;
  onDistance: (value: string) => void;
  onFind: () => void;
  onTab: (tab: RunTab) => void;
  onFree: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const empty = finding && tab === 'rec' ? '코스를 찾는 중…' : tab === 'mine' ? '저장한 코스가 없어요' : message || '아직 찾은 코스가 없어요';

  return (
    <View style={[styles.root, { paddingBottom: Math.max(12, insets.bottom), paddingTop: insets.top + 16 }]}>
      <KindsBar kinds={kinds} onBack={onBack} title="러닝" />
      {active ? (
        <Pressable accessibilityRole="button" onPress={active.onResume} style={({ pressed }) => [styles.keep, pressed && styles.keepPressed]}>
          <View style={styles.keepCopy}>
            <Text style={styles.words}>달리던 러닝이 있어요</Text>
            <Text style={styles.note}>{active.detail}</Text>
          </View>
          <Text style={styles.keepTag}>이어하기</Text>
        </Pressable>
      ) : null}
      <View style={styles.find}>
        <TextInput
          accessibilityLabel="달릴 지역"
          maxLength={120}
          onChangeText={onRegion}
          onSubmitEditing={onFind}
          placeholder="지역 (예: 잠실, 마포구, 부산)"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          style={styles.field}
          value={region}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: finding }}
          disabled={finding}
          onPress={onFind}
          style={({ pressed }) => [styles.go, finding && styles.off, pressed && styles.goPressed]}
        >
          <Text style={[styles.words, styles.onText]}>찾기</Text>
        </Pressable>
      </View>
      <View style={styles.segRow}>
        {distances.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: distance === option }}
            onPress={() => onDistance(option)}
            style={[styles.seg, distance === option && styles.segOn]}
          >
            <Text style={[styles.segText, distance === option && styles.onText]}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.list}>
        <View style={styles.tabs}>
          {(
            [
              ['rec', `추천${finding ? '' : ` ${counts.rec}`}`],
              ['mine', `저장 ${counts.mine}`],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === value }}
              onPress={() => onTab(value)}
              style={[styles.mini, tab === value && styles.on]}
            >
              <Text style={[styles.miniText, tab === value && styles.tabOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {rows.length > 0 && !(finding && tab === 'rec') ? (
          <ScrollView contentContainerStyle={styles.rows} showsVerticalScrollIndicator={false}>
            {rows.map((row, index) => (
              <Pressable
                accessibilityLabel={`${row.name} 코스 보기`}
                accessibilityRole="button"
                key={row.key}
                onPress={row.onPress}
                style={({ pressed }) => [styles.row, index === 0 && styles.rowFirst, pressed && styles.rowPressed]}
              >
                <Text style={styles.no}>{index + 1}</Text>
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.words}>
                    {row.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.note}>
                    {row.detail}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.none}>
            <Text style={[styles.note, styles.center]}>{empty}</Text>
          </View>
        )}
      </View>
      {/* With rows shown, what a search said (nothing found, or why it failed) still has to be read. */}
      {message && rows.length > 0 && tab === 'rec' ? <Text style={[styles.note, styles.center]}>{message}</Text> : null}

      <Pressable accessibilityRole="button" hitSlop={8} onPress={onFree} style={styles.free}>
        <Text style={styles.link}>코스 없이 달리기</Text>
      </Pressable>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, paddingHorizontal: 20, width: '100%' },
    words: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    note: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    center: { textAlign: 'center' },
    onText: a.onText,
    keep: { ...a.card, alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 10, marginTop: 14, paddingLeft: 20, paddingRight: 12, paddingVertical: 12 },
    keepPressed: { opacity: 0.85 },
    keepCopy: { flex: 1, gap: 2, minWidth: 0 },
    keepTag: {
      ...a.p12,
      backgroundColor: colors.primary,
      borderRadius: 999,
      color: colors.onPrimary,
      fontFamily: fontFamilies.pretendardBold,
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    find: { flexDirection: 'row', gap: 8, marginTop: 16 },
    field: { ...a.field, ...a.input, backgroundColor: colors.surface, borderRadius: 999, flex: 1, height: 46, minWidth: 0, paddingHorizontal: 18 },
    go: { ...a.go, height: 46, paddingHorizontal: 18 },
    goPressed: a.goPressed,
    off: { opacity: 0.4 },
    segRow: { backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', marginTop: 10, padding: 4 },
    seg: { alignItems: 'center', borderRadius: 999, flex: 1, height: 38, justifyContent: 'center' },
    segOn: a.on,
    segText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    // The list takes the height that is left, and scrolls inside itself.
    list: { ...a.card, flex: 1, marginBottom: 6, marginTop: 14, minHeight: 150, overflow: 'hidden' },
    // the two lists as words, the open one bold
    tabs: { flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingTop: 12 },
    mini: { justifyContent: 'center', minHeight: 36 },
    miniText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13.5, lineHeight: 19 },
    on: {},
    tabOn: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold },
    rows: { paddingBottom: 6, paddingHorizontal: 20 },
    row: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, minHeight: 64 },
    rowFirst: { borderTopWidth: 0 },
    rowPressed: { opacity: 0.7 },
    no: {
      ...a.p12,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 18,
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardExtraBold,
      height: 36,
      lineHeight: 36,
      overflow: 'hidden',
      textAlign: 'center',
      width: 36,
    },
    rowCopy: { flex: 1, gap: 2, minWidth: 0 },
    none: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 16 },
    free: { alignItems: 'center', height: 44, justifyContent: 'center' },
    link: a.link,
  } as const;
}
