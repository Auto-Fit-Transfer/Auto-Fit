import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';

// "읽은 수치 확인" in renewal B's way (b-docs.html): the app's black card says which paper it read and how much
// of it, then the kind, then what was read row by row (a row opens to mend it), and saving at the foot.
// app/(health-data)/ocr-result.tsx fills it and keeps the box that changes a value.
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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20, paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bar}>
          <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" onPress={props.onBack} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
            <CaretLeftIcon color={colors.textPrimary} height={22} width={22} />
          </Pressable>
          <View style={styles.grow} />
          <Pressable accessibilityRole="button" disabled={busy} hitSlop={8} onPress={props.onReupload} style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
            <Text style={styles.miniText}>다시 올리기</Text>
          </Pressable>
          <Pressable accessibilityLabel="홈으로 가기" accessibilityRole="button" hitSlop={8} onPress={props.onHome} style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
            <Text style={styles.miniText}>홈</Text>
          </Pressable>
        </View>

        <View style={styles.ai}>
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
              {fileName} · {fileTime}
            </Text>
            <Text style={styles.aiTitle}>
              {missing ? `${cells.length}개 중 ${cells.length - missing}개를 읽었어요` : `${cells.length}개를 모두 읽었어요`}
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {kinds.map(({ type, label, has, on }) => (
            <Pressable hitSlop={{ bottom: 2, top: 2 }}
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

        {missing ? <Text style={styles.note}>못 읽은 칸은 눌러서 적어 주세요</Text> : null}
        <View style={styles.rows}>
          {cells.map((cell, index) => (
            <Pressable
              accessibilityLabel={`${cell.label} ${cell.value ? `${cell.value}${cell.unit ? ` ${cell.unit}` : ''}` : '못 읽었어요'}, 고치기`}
              accessibilityRole="button"
              disabled={!canEdit}
              key={cell.key}
              onPress={() => props.onCell(cell.key)}
              style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.rowLabel}>
                {cell.label}
              </Text>
              <Text numberOfLines={1} style={[styles.rowValue, !cell.value && styles.rowMissing]}>
                {cell.value || '못 읽었어요'}
                {cell.value && cell.unit ? <Text style={styles.unit}> {cell.unit}</Text> : null}
              </Text>
              {canEdit ? <CaretRightIcon color={colors.textDisabled} height={16} width={16} /> : null}
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
    content: { gap: 14, paddingHorizontal: 24 },
    grow: { flex: 1 },
    pressed: { opacity: 0.72 },
    note: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    bar: { alignItems: 'center', flexDirection: 'row', gap: 8, height: 52 },
    round: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    mini: { ...a.mini, backgroundColor: colors.surface },
    miniText: a.miniText,

    ai: { alignItems: 'center', backgroundColor: colors.aiCard, borderRadius: 28, flexDirection: 'row', gap: 14, padding: 20 },
    filePreview: { backgroundColor: colors.aiRaised, borderRadius: 12, gap: 5, height: 44, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 9, width: 44 },
    filePreviewImage: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    paperLine: { backgroundColor: colors.onAiMuted, borderRadius: 1, height: 2 },
    fileTexts: { flex: 1, gap: 2, minWidth: 0 },
    fileName: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 17, lineHeight: 24 },

    tabs: { backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', padding: 4 },
    tab: { alignItems: 'center', borderRadius: 999, flex: 1, height: 40, justifyContent: 'center' },
    tabOn: a.on,
    tabOff: {},
    tabText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    tabTextOn: a.onText,

    rows: { ...a.card, paddingHorizontal: 20, paddingVertical: 4 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 52 },
    rowLine: { borderTopColor: colors.border, borderTopWidth: 1 },
    rowLabel: { color: colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 20 },
    rowValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21, maxWidth: '55%' },
    rowMissing: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium },
    unit: { ...a.p12, color: colors.textSecondary },

    privacy: { textAlign: 'center' },
    go: { ...a.go, height: 54 },
    goOff: a.goOff,
    goPressed: a.goPressed,
    goText: a.goText,
    disabledText: { color: colors.textDisabled },
  } as const;
}
