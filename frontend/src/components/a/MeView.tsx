import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { Text } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ASwitch } from './ASwitch';
import { aForm } from './form';
import { HeroHead, type Who } from './sprites';

// Renewal A's 내 정보 (a-me.html): what the app knows about me and my settings in one place. Who I am in
// one low row on top, then two groups of lines, and each line shows its value now, so it can be read
// without opening it. A view that only shows what it is given; app/(tabs)/my.tsx fills it.
export interface MeRow {
  key: string;
  label: string;
  value: string; // empty while it is still being read
  onPress: () => void;
}
export interface MeViewProps {
  who: Who;
  tierIndex: number;
  name: string;
  photo?: string | null; // my own picture; without one my character's face stands in
  tier: { name: string; stars: number } | null;
  days: number | null;
  notice?: string | null;
  health: MeRow[];
  // Counting steps: null = this phone cannot count them, so there is nothing to switch.
  steps: { on: boolean; onToggle: () => void } | null;
  settings: MeRow[];
  onBack: () => void;
  onEdit: () => void;
  onTier: () => void;
}

export function MeView({ who, tierIndex, name, photo, tier, days, notice, health, steps, settings, onBack, onEdit, onTier }: MeViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const rows = (list: MeRow[]) =>
    list.map((row, index) => (
      <Pressable
        accessibilityLabel={`${row.label}${row.value ? `, ${row.value}` : ''}`}
        accessibilityRole="button"
        key={row.key}
        onPress={row.onPress}
        style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.dim]}
      >
        <Text style={styles.rowLabel}>{row.label}</Text>
        <View style={styles.rowEnd}>
          <Text numberOfLines={1} style={styles.rowValue}>
            {row.value}
          </Text>
          <CaretRightIcon color={colors.ink} height={18} width={18} />
        </View>
      </Pressable>
    ));

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110, paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bar}>
          <Pressable accessibilityLabel="홈으로" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.sunk]}>
            <BackIcon color={colors.ink} height={22} width={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.heading}>
            내 정보
          </Text>
        </View>

        <View style={styles.id}>
          <View style={styles.avatar}>
            {photo ? <Image accessibilityIgnoresInvertColors source={{ uri: photo }} style={styles.photo} /> : <HeroHead tier={tierIndex} who={who} zoom={2} />}
          </View>
          <View style={styles.idCopy}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            {tier ? (
              <Pressable accessibilityLabel={`내 티어 ${tier.name}, 티어 보기`} accessibilityRole="button" hitSlop={8} onPress={onTier} style={styles.level}>
                <Text style={styles.levelText}>{tier.name}</Text>
                <Text style={styles.stars}>
                  {[1, 2, 3].map((star) => (
                    <Text key={star} style={{ color: star <= tier.stars ? colors.gold : colors.track }}>
                      ★
                    </Text>
                  ))}
                </Text>
              </Pressable>
            ) : null}
            {days ? <Text style={styles.note}>함께한 지 {days.toLocaleString('ko-KR')}일</Text> : null}
          </View>
          <Pressable hitSlop={{ bottom: 6, top: 6 }} accessibilityRole="button" onPress={onEdit} style={({ pressed }) => [styles.mini, pressed && styles.sunkMini]}>
            <Text style={styles.miniText}>프로필 수정</Text>
          </Pressable>
        </View>
        {notice ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        <Text style={styles.group}>내 건강</Text>
        <View style={styles.rows}>
          {rows(health)}
          {steps ? (
            <View style={[styles.row, styles.rowLine]}>
              <View style={styles.switchCopy}>
                <Text style={styles.rowLabel}>걸음 자동 기록</Text>
                {steps.on ? null : <Text style={styles.note}>꺼져 있어서 걸음 퀘스트를 세지 않아요</Text>}
              </View>
              <ASwitch label="걸음 자동 기록" onChange={steps.onToggle} value={steps.on} />
            </View>
          ) : null}
        </View>

        <Text style={styles.group}>설정 · 활동</Text>
        <View style={styles.rows}>{rows(settings)}</View>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const flat = '0 0 0 rgba(32, 35, 63, 0.3)';
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { paddingHorizontal: 16 },
    dim: { opacity: 0.7 },
    sunk: { boxShadow: flat, transform: [{ translateY: 4 }] },
    sunkMini: { boxShadow: flat, transform: [{ translateY: 3 }] },
    note: a.note,

    // the bar every A tab screen starts with: the way back home, then the screen's name
    bar: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 48, marginBottom: 14 },
    back: { ...a.card, alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
    heading: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },

    // who I am, in one low row
    id: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 14, paddingBottom: 12, paddingLeft: 12, paddingRight: 14, paddingTop: 12 },
    avatar: { alignItems: 'center', backgroundColor: colors.primaryLight, borderColor: colors.ink, borderRadius: 16, borderWidth: 2, height: 64, justifyContent: 'center', overflow: 'hidden', width: 64 },
    photo: { height: '100%', width: '100%' },
    idCopy: { flex: 1, gap: 3, minWidth: 0 },
    name: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    level: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6 },
    levelText: { ...a.p12, color: colors.primaryText },
    stars: { fontSize: 12, lineHeight: 15 },
    mini: a.mini,
    miniText: a.miniText,
    notice: { ...a.p12, color: colors.danger, marginTop: 10, paddingHorizontal: 2 },

    // a group of lines: its small name, then one card
    group: { ...a.q, marginTop: 26, paddingHorizontal: 2 },
    rows: { ...a.card, paddingHorizontal: 14 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 54 },
    rowLine: { borderTopColor: colors.track, borderTopWidth: 2 },
    rowLabel: { ...a.p15, color: colors.ink, flexShrink: 0 },
    // A long value is cut short; the line's name never gives way to it.
    rowEnd: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end', minWidth: 0 },
    // What a line is set to now is read as much as its name, so it is as dark, only smaller.
    rowValue: { ...a.p12, color: colors.ink, flexShrink: 1, textAlign: 'right' },
    switchCopy: { flex: 1, gap: 2, paddingVertical: 8 },
  } as const;
}
