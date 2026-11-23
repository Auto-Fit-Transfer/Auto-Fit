import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';

// Renewal A's "읽은 수치 확인" (a-docs.html): the paper I gave in one row, then every value the app read
// as a cell, two to a row, all on one screen. A cell it could not read is violet and says so; a tap on a
// cell changes that one value. A view that only shows what it is given; app/(health-data)/ocr-result.tsx
// fills it and keeps the box that changes a value.
export interface PaperValuesProps<Key extends string, Kind extends string> {
  fileName: string;
  fileTime: string;
  previewUri: string | null; // a photo of the paper, when there is one to show
  kinds: { type: Kind; label: string; has: boolean; on: boolean }[];
  cells: { key: Key; label: string; value: string; unit: string }[];
  canEdit: boolean;
  busy: boolean; // saving or uploading again
  note: string;
  next: { label: string; disabled: boolean };
  onKind: (type: Kind) => void;
  onCell: (key: Key) => void;
  onBack: () => void;
  onHome: () => void;
  onReupload: () => void;
  onNext: () => void;
}

export function PaperValuesView<Key extends string, Kind extends string>(props: PaperValuesProps<Key, Kind>) {
  const { fileName, fileTime, previewUri, kinds, cells, canEdit, busy, note, next } = props;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const missing = cells.filter((cell) => !cell.value).length;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20, paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bar}>
          <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" onPress={props.onBack} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
            <CaretLeftIcon color={colors.ink} height={22} width={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.heading}>
            읽은 수치 확인
          </Text>
          <Pressable accessibilityLabel="홈으로 가기" accessibilityRole="button" hitSlop={8} onPress={props.onHome} style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
            <Text style={styles.miniText}>홈</Text>
          </Pressable>
        </View>

        <View style={styles.file}>
          <View style={styles.filePreview}>
            {previewUri ? (
              <Image accessibilityLabel={`${fileName} 미리보기`} resizeMode="cover" source={{ uri: previewUri }} style={styles.filePreviewImage} />
            ) : (
              // A sheet of paper with lines, where a photo of the paper cannot be shown.
              [0, 1, 2].map((line) => <View key={line} style={styles.paperLine} />)
            )}
          </View>
          <View style={styles.fileTexts}>
            <Text numberOfLines={1} style={styles.fileName}>
              {fileName}
            </Text>
            <Text style={styles.note}>{fileTime}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={busy} hitSlop={8} onPress={props.onReupload} style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
            <Text style={styles.miniText}>다시 올리기</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {kinds.map(({ type, label, has, on }) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ disabled: !has, selected: on }}
              disabled={!has}
              key={type}
              onPress={() => props.onKind(type)}
              style={[styles.tab, on && styles.tabOn, !has && styles.tabOff]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn, !has && styles.disabledText]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {missing ? (
          <Text style={styles.note}>
            {cells.length}개 중 {missing}개를 못 읽었어요. 칸을 눌러 적어 주세요
          </Text>
        ) : null}
        <View style={styles.grid}>
          {cells.map((cell) => (
            <Pressable
              accessibilityLabel={`${cell.label} ${cell.value ? `${cell.value}${cell.unit ? ` ${cell.unit}` : ''}` : '못 읽었어요'}, 고치기`}
              accessibilityRole="button"
              disabled={!canEdit}
              key={cell.key}
              onPress={() => props.onCell(cell.key)}
              style={({ pressed }) => [styles.cell, !cell.value && styles.cellMissing, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.note}>
                {cell.label}
              </Text>
              <Text numberOfLines={1} style={[styles.cellValue, !cell.value && styles.cellValueMissing]}>
                {cell.value || '못 읽었어요'}
                {cell.value && cell.unit ? <Text style={styles.unit}> {cell.unit}</Text> : null}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.note, styles.privacy]}>{note}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: next.disabled }}
          disabled={next.disabled}
          onPress={props.onNext}
          style={({ pressed }) => [styles.go, next.disabled && styles.goOff, pressed && styles.goPressed]}
        >
          <Text style={[styles.goText, next.disabled && styles.disabledText]}>{next.label}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16 },
    pressed: { opacity: 0.72 },
    note: a.note,
    bar: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 48 },
    round: { ...a.card, alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
    heading: { color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    mini: a.mini,
    miniText: a.miniText,

    file: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 12, padding: 10 },
    filePreview: { backgroundColor: colors.primaryLight, borderColor: colors.border, borderRadius: 10, borderWidth: 1, gap: 5, height: 44, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 8, width: 44 },
    filePreviewImage: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    paperLine: { backgroundColor: colors.ink, height: 2 },
    fileTexts: { flex: 1, gap: 2, minWidth: 0 },
    fileName: { ...a.p15, color: colors.ink },

    tabs: { flexDirection: 'row', gap: 8 },
    tab: a.seg,
    tabOn: a.segOn,
    tabOff: { backgroundColor: colors.surfaceMuted, },
    tabText: a.segText,
    tabTextOn: a.onText,

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
    cell: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 2, paddingHorizontal: 12, paddingVertical: 8, width: '48.8%' },
    cellMissing: { backgroundColor: colors.primaryLight },
    cellValue: { ...a.p15, color: colors.ink },
    cellValueMissing: { color: colors.primaryText },
    unit: { ...a.p12, color: colors.textSecondary },

    privacy: { textAlign: 'center' },
    go: { ...a.go, height: 52 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    disabledText: { color: colors.textDisabled },
  } as const;
}
