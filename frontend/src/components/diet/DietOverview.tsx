import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { AppCard, ProgressBar, Text } from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Top part of the diet tab, Figma D1: week strip, "오늘 먹은 양" card, photo record row.

export interface DietDay {
  key: string;
  weekday: string;
  day: number;
  selected: boolean;
  disabled: boolean;
}

export function DietWeekStrip({
  days,
  onSelect,
}: {
  days: DietDay[];
  onSelect: (key: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityRole="tablist" style={styles.strip}>
      {days.map((day) => (
        <Pressable
          key={day.key}
          accessibilityLabel={`${day.day}일 ${day.weekday}요일`}
          accessibilityRole="tab"
          accessibilityState={{ disabled: day.disabled, selected: day.selected }}
          disabled={day.disabled}
          onPress={() => onSelect(day.key)}
          style={[
            styles.day,
            day.selected && styles.daySelected,
            day.disabled && styles.dayDisabled,
          ]}
        >
          <Text style={day.selected ? styles.weekdaySelected : styles.weekday}>{day.weekday}</Text>
          <Text style={day.selected ? styles.dateSelected : styles.date}>{day.day}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface DietAmount {
  label: string;
  current: number | null;
  target: number | null;
  unit: string;
}

const amount = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString('ko-KR'));
const ratio = ({ current, target }: DietAmount) =>
  current !== null && target ? current / target : 0;

export function DietIntakeCard({
  calories,
  macros,
  notes,
}: {
  calories: DietAmount;
  macros: DietAmount[];
  notes?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const percent =
    calories.current !== null && calories.target ? Math.round(ratio(calories) * 100) : null;
  return (
    <AppCard style={styles.intake}>
      <View style={styles.intakeTop}>
        <View style={styles.flex}>
          <Text style={styles.label}>오늘 먹은 양</Text>
          <View style={styles.valueRow}>
            <Text style={styles.big}>{amount(calories.current)}</Text>
            <Text style={styles.unit}>
              / {amount(calories.target)} {calories.unit}
            </Text>
          </View>
        </View>
        <Text style={styles.percent}>{percent === null ? '—' : `${percent}%`}</Text>
      </View>
      <ProgressBar height={6} value={ratio(calories)} />
      <View style={styles.macros}>
        {macros.map((macro) => (
          <View key={macro.label} style={styles.macro}>
            <Text style={styles.label}>{macro.label}</Text>
            <Text style={styles.macroValue}>
              {amount(macro.current)} / {amount(macro.target)}
              {macro.unit}
            </Text>
            <ProgressBar value={ratio(macro)} />
          </View>
        ))}
      </View>
      {notes}
    </AppCard>
  );
}

export function DietPhotoRecordRow({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <AppCard style={styles.photoRow}>
        <View style={styles.rowIcon}>
          <CameraIcon color={colors.textPrimary} height={20} width={20} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>사진으로 기록하기</Text>
          <Text style={styles.label}>찍으면 음식과 칼로리를 알려 드려요</Text>
        </View>
        <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
      </AppCard>
    </Pressable>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    strip: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 16,
      flexDirection: 'row',
      gap: 2,
      padding: 4,
    },
    day: { alignItems: 'center', borderRadius: 12, flex: 1, paddingVertical: 8 },
    daySelected: { backgroundColor: colors.elevated },
    dayDisabled: { opacity: 0.4 },
    weekday: { ...text.body2, color: colors.textSecondary },
    weekdaySelected: { ...text.body2, color: colors.textPrimary },
    date: { ...text.body1, color: colors.textBody },
    dateSelected: { ...text.body1Strong, color: colors.textPrimary },
    intake: { gap: 12, paddingHorizontal: 18, paddingVertical: 18 },
    intakeTop: { alignItems: 'flex-end', flexDirection: 'row' },
    label: { ...text.body2, color: colors.textSecondary },
    valueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
    big: { ...text.title1, color: colors.textPrimary },
    unit: { ...text.body2, color: colors.textSecondary },
    percent: { ...text.body1Strong, color: colors.textPrimary },
    macros: { flexDirection: 'row', gap: 8 },
    macro: { flex: 1, gap: 4 },
    macroValue: { ...text.body2Strong, color: colors.textPrimary },
    photoRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowIcon: {
      alignItems: 'center',
      backgroundColor: colors.elevated,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    rowTitle: { ...text.body1Strong, color: colors.textPrimary },
  } as const;
}
