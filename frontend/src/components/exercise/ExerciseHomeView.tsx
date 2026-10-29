import type { ComponentType } from 'react';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ClockIcon from '@/assets/icons/ui/clock.svg';
import FireIcon from '@/assets/icons/ui/fire.svg';
import { AppButton, AppCard, Chip, ListRow, ProgressBar, Text } from '@/src/components/common';
import { TabScreen } from '@/src/components/navigation';
import type { ExerciseLocation } from '@/src/features/exercise/exerciseData';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

export type ExerciseHomeState = 'loading' | 'not-created' | 'ready' | 'completed';

export interface ExerciseHomeViewProps {
  state: ExerciseHomeState;
  routine: { title: string; minutes: number | null; count: number; kcal: number | null } | null;
  location: ExerciseLocation | null;
  week: {
    rangeLabel: string;
    count: number | null;
    target: number | null;
    percent: number | null;
    doneDayLabels: string[];
    minutes: number | null;
  };
  recent: { title: string; detail: string } | null;
  error: string | null;
  onRetry: () => void;
  onLocationChange: (location: ExerciseLocation) => void;
  onPrimary: () => void;
  onRecommendAgain: () => void;
  onOpenRecent: () => void;
  onOpenGoal: () => void;
  onOpenProgress: () => void;
}

const locations = [
  { value: 'gym', label: '헬스장' },
  { value: 'home', label: '집' },
  { value: 'outdoor', label: '야외' },
] as const;

const primaryLabel: Record<ExerciseHomeState, string> = {
  loading: '운동 정보 확인 중',
  'not-created': '오늘 운동 추천받기',
  ready: '운동 시작하기',
  completed: '운동 결과 보기',
};

const value = (n: number | null) => (n === null ? '—' : n.toLocaleString('ko-KR'));

// Exercise tab, Figma E3.
export function ExerciseHomeView(props: ExerciseHomeViewProps) {
  const styles = useThemedStyles(createStyles);
  const { state, routine, week } = props;
  const segments = week.target !== null && week.target > 0 && week.target <= 7 ? week.target : null;
  const remaining =
    week.count !== null && week.target !== null ? Math.max(0, week.target - week.count) : null;

  return (
    <TabScreen title="운동">
      {props.error ? (
        <Pressable accessibilityRole="button" onPress={props.onRetry}>
          <AppCard soft>
            <Text style={styles.body}>{props.error} · 다시 시도</Text>
          </AppCard>
        </Pressable>
      ) : null}

      <AppCard style={styles.today}>
        <Text style={styles.label}>오늘의 운동</Text>
        {state === 'ready' || state === 'completed' ? (
          <>
            <Text style={styles.title}>
              {state === 'completed' ? '오늘 운동을 마쳤어요' : (routine?.title ?? '오늘의 루틴')}
            </Text>
            {routine ? (
              <View style={styles.facts}>
                <Fact Icon={ClockIcon} text={`${value(routine.minutes)}분`} />
                <Fact Icon={BarbellIcon} text={`${routine.count}가지`} />
                <Fact Icon={FireIcon} text={`약 ${value(routine.kcal)}kcal`} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.title}>
              {state === 'loading' ? '오늘의 운동을 확인하고 있어요' : '어디서 운동할까요?'}
            </Text>
            <View style={styles.chips}>
              {locations.map((option) => (
                <Chip
                  key={option.value}
                  disabled={state === 'loading'}
                  label={option.label}
                  onPress={() => props.onLocationChange(option.value)}
                  selected={props.location === option.value}
                />
              ))}
            </View>
          </>
        )}
        <View style={styles.spacer} />
        <AppButton
          disabled={state === 'loading'}
          onPress={props.onPrimary}
          title={primaryLabel[state]}
        />
        {state === 'ready' ? (
          <AppButton
            fullWidth={false}
            onPress={props.onRecommendAgain}
            size="M"
            style={styles.again}
            title="다시 추천받기"
            variant="text"
          />
        ) : null}
      </AppCard>

      <AppCard style={styles.week}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>이번 주 목표</Text>
          <Text style={styles.muted}>{week.rangeLabel}</Text>
        </View>
        <View style={styles.spread}>
          <View style={styles.valueRow}>
            <Text style={styles.big}>{value(week.count)}</Text>
            <Text style={styles.unit}>/ {value(week.target)}회</Text>
          </View>
          <Text style={styles.cardTitle}>{week.percent === null ? '—' : `${week.percent}%`}</Text>
        </View>
        {segments ? (
          <View style={styles.segments}>
            {Array.from({ length: segments }, (_, index) => {
              const done = week.count !== null && index < week.count;
              const day = week.doneDayLabels[index];
              return (
                <View key={index} style={styles.segment}>
                  <View style={[styles.bar, done ? styles.barDone : styles.barLeft]} />
                  <Text style={done ? styles.segmentDone : styles.segmentLeft}>
                    {index + 1}회 · {done ? (day ?? '완료') : '남음'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <ProgressBar value={(week.percent ?? 0) / 100} />
        )}
        <View style={styles.smallRow}>
          <View style={styles.small}>
            <Text style={styles.body}>운동 시간</Text>
            <Text style={styles.strong}>{value(week.minutes)}분</Text>
          </View>
          <View style={styles.small}>
            <Text style={styles.body}>목표까지</Text>
            <Text style={styles.strong}>{remaining === 0 ? '달성' : `${value(remaining)}회`}</Text>
          </View>
        </View>
      </AppCard>

      {props.recent ? (
        <>
          <Text style={styles.section}>최근 운동</Text>
          <Pressable accessibilityRole="button" onPress={props.onOpenRecent}>
            <AppCard style={styles.recent}>
              <RowIcon Icon={BarbellIcon} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {props.recent.title}
                </Text>
                <Text numberOfLines={1} style={styles.muted}>
                  {props.recent.detail}
                </Text>
              </View>
              <Caret />
            </AppCard>
          </Pressable>
        </>
      ) : null}

      <AppCard padding="none" style={styles.menu}>
        {[
          {
            title: '운동 목표 설정',
            description: '기간 · 주간 횟수 · 목표 종류',
            onPress: props.onOpenGoal,
          },
          { title: '운동 기록 보기', description: '최근 30일 기록', onPress: props.onOpenProgress },
        ].map((row, index) => (
          <Fragment key={row.title}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <ListRow
              description={row.description}
              onPress={row.onPress}
              rightElement={<Caret />}
              style={styles.row}
              title={row.title}
            />
          </Fragment>
        ))}
      </AppCard>
    </TabScreen>
  );
}

function Fact({ Icon, text }: { Icon: ComponentType<SvgProps>; text: string }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.fact}>
      <Icon color={colors.textBody} height={16} width={16} />
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

function RowIcon({ Icon }: { Icon: ComponentType<SvgProps> }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rowIcon}>
      <Icon color={colors.textPrimary} height={20} width={20} />
    </View>
  );
}

function Caret() {
  const { colors } = useAppTheme();
  return <CaretRightIcon color={colors.textSecondary} height={20} width={20} />;
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    label: { ...text.body2, color: colors.textSecondary },
    title: { ...text.title2, color: colors.textPrimary },
    cardTitle: { ...text.body1Strong, color: colors.textPrimary },
    section: { ...text.title2, color: colors.textPrimary },
    muted: { ...text.body2, color: colors.textSecondary },
    body: { ...text.body2, color: colors.textBody },
    strong: { ...text.body2Strong, color: colors.textPrimary },
    today: { gap: 10, paddingHorizontal: 18, paddingVertical: 20 },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    fact: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    spacer: { height: 4 },
    again: { alignSelf: 'center' },
    week: { gap: 12, paddingHorizontal: 18, paddingVertical: 18 },
    spread: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    valueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
    big: { ...text.title1, color: colors.textPrimary },
    unit: { ...text.body1, color: colors.textSecondary },
    segments: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, gap: 4 },
    bar: { borderRadius: 4, height: 8 },
    barDone: { backgroundColor: colors.gaugeFill },
    barLeft: { backgroundColor: colors.gaugeTrack },
    segmentDone: { ...text.captionStrong, color: colors.textPrimary },
    segmentLeft: { ...text.caption, color: colors.textSecondary },
    smallRow: { flexDirection: 'row', gap: 8 },
    small: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    recent: {
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
    menu: { overflow: 'hidden', paddingVertical: 2 },
    row: { paddingHorizontal: 16 },
    divider: { backgroundColor: colors.border, height: 1 },
  } as const;
}
