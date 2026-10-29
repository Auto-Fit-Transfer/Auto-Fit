import { useRef, type ComponentType } from 'react';
import { Pressable, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import Logo from '@/assets/brand/autofit-logo.svg';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import BellIcon from '@/assets/icons/ui/bell.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChartIcon from '@/assets/icons/ui/chart-line-up.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import CoreBadge from '@/assets/tier/core.svg';
import {
  AppButton,
  AppCard,
  IconButton,
  ListRow,
  ProgressBar,
  Text,
} from '@/src/components/common';
import { TabScreen } from '@/src/components/navigation';
import { weekdayLabels } from '@/src/features/home/homeSummary';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import type { AIChatButtonAnchor } from './DraggableAIChatButton';

export interface HomeViewProps {
  dateLabel: string;
  userName: string;
  loading: boolean;
  // null until the first health document is read; the home then shows the "first steps" layout.
  health: { score: number; total: number; change: number | null } | null;
  diet: { consumed: number | null; target: number | null };
  exercise: {
    status: 'not-created' | 'ready' | 'completed' | null;
    doneMinutes: number | null;
    plannedMinutes: number | null;
  };
  week: {
    count: number | null;
    target: number | null;
    doneDays: boolean[];
    todayIndex: number;
    minutes: number | null;
  };
  onOpenNotifications: () => void;
  onOpenTier: () => void;
  onOpenAnalysis: () => void;
  onOpenDiet: () => void;
  onOpenExercise: () => void;
  onStartExercise: () => void;
  onUploadData: () => void;
  onAskQwony: (anchor: AIChatButtonAnchor) => void;
}

const number = (value: number | null) => (value === null ? '—' : value.toLocaleString('ko-KR'));

// Home tab, Figma C2 (with data) and C1 (before any health data).
export function HomeView(props: HomeViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { dateLabel, userName, loading, health } = props;

  return (
    <TabScreen
      left={<Logo color={colors.textPrimary} height={23} width={85} />}
      right={
        <IconButton
          accessibilityLabel="알림"
          icon={<BellIcon color={colors.textPrimary} height={24} width={24} />}
          onPress={props.onOpenNotifications}
          size={44}
        />
      }
    >
      <View style={styles.greeting}>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.hello}>{userName}님, 반가워요</Text>
      </View>
      {loading && !health ? (
        <AppCard>
          <Text style={styles.muted}>오늘 기록을 불러오는 중이에요.</Text>
        </AppCard>
      ) : health ? (
        <HomeWithData {...props} health={health} />
      ) : (
        <HomeFirstSteps {...props} />
      )}
    </TabScreen>
  );
}

function HomeWithData({
  health,
  diet,
  exercise,
  week,
  onOpenTier,
  onOpenAnalysis,
  onOpenDiet,
  onOpenExercise,
  onAskQwony,
}: HomeViewProps & { health: NonNullable<HomeViewProps['health']> }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const left =
    diet.consumed !== null && diet.target !== null ? Math.round(diet.target - diet.consumed) : null;
  const exerciseNote =
    exercise.status === 'completed'
      ? '오늘 운동을 마쳤어요'
      : exercise.status === 'ready'
        ? `추천 운동 ${number(exercise.plannedMinutes)}분 준비됨`
        : '오늘 운동을 추천받아 보세요';
  const exerciseTarget = exercise.plannedMinutes;
  const remaining =
    week.count !== null && week.target !== null ? Math.max(0, week.target - week.count) : null;

  return (
    <>
      <AppCard style={styles.scoreCard}>
        <View style={styles.scoreTop}>
          <View style={styles.flex}>
            <Text style={styles.cardLabel}>건강 점수</Text>
            <View style={styles.valueRow}>
              <Text style={styles.bigValue}>{health.score}</Text>
              <Text style={styles.unit}>/ {health.total}</Text>
            </View>
            {health.change !== null ? (
              <Text style={styles.change}>
                지난번보다 {health.change > 0 ? '+' : ''}
                {health.change}
              </Text>
            ) : null}
          </View>
          <AppButton fullWidth={false} onPress={onOpenTier} title="내 티어" variant="outline" />
        </View>
        <ProgressBar value={health.total > 0 ? health.score / health.total : 0} />
        <Pressable accessibilityRole="button" onPress={onOpenAnalysis} style={styles.cardFoot}>
          <Text style={styles.muted}>건강검진 · 인바디 기준</Text>
          <Text style={styles.link}>종합 분석 보기</Text>
        </Pressable>
      </AppCard>

      <View style={styles.todayRow}>
        <Pressable accessibilityRole="button" onPress={onOpenDiet} style={styles.flex}>
          <AppCard style={styles.todayCard}>
            <Text style={styles.cardLabel}>오늘 식단</Text>
            <View style={styles.valueRow}>
              <Text style={styles.bigValue}>{number(diet.consumed)}</Text>
              <Text style={styles.unit}>/ {number(diet.target)} kcal</Text>
            </View>
            <ProgressBar
              height={6}
              value={diet.consumed !== null && diet.target ? diet.consumed / diet.target : 0}
            />
            <Text style={styles.note}>
              {left === null
                ? '오늘 먹은 음식을 기록해 보세요'
                : left >= 0
                  ? `${left.toLocaleString('ko-KR')}kcal 더 먹어도 돼요`
                  : `목표보다 ${Math.abs(left).toLocaleString('ko-KR')}kcal 더 먹었어요`}
            </Text>
          </AppCard>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenExercise} style={styles.flex}>
          <AppCard style={styles.todayCard}>
            <Text style={styles.cardLabel}>오늘 운동</Text>
            <View style={styles.valueRow}>
              <Text style={styles.bigValue}>{number(exercise.doneMinutes ?? 0)}</Text>
              <Text style={styles.unit}>/ {number(exerciseTarget)}분</Text>
            </View>
            <ProgressBar
              height={6}
              value={
                exercise.doneMinutes !== null && exerciseTarget
                  ? exercise.doneMinutes / exerciseTarget
                  : 0
              }
            />
            <Text style={styles.note}>{exerciseNote}</Text>
          </AppCard>
        </Pressable>
      </View>

      <AppCard style={styles.weekCard}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>이번 주 운동</Text>
          <Text style={styles.cardTitle}>
            {number(week.count)} / {number(week.target)}회
          </Text>
        </View>
        <View style={styles.spread}>
          {weekdayLabels.map((label, index) => {
            const done = week.doneDays[index];
            const today = index === week.todayIndex;
            return (
              <View key={label} style={styles.day}>
                <View
                  style={[
                    styles.dayMark,
                    done && styles.dayDone,
                    today && !done && styles.dayToday,
                  ]}
                >
                  {done ? <CheckIcon color={colors.background} height={16} width={16} /> : null}
                </View>
                <Text style={today ? styles.dayLabelToday : styles.dayLabel}>{label}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.note}>
          이번 주 {number(week.minutes)}분 운동
          {remaining === null
            ? ''
            : remaining === 0
              ? ' · 목표 달성'
              : ` · 목표까지 ${remaining}회`}
        </Text>
      </AppCard>

      <QwonyRow description="점수가 왜 바뀌었는지, 오늘 뭐 먹을지" onAsk={onAskQwony} standalone />
    </>
  );
}

function HomeFirstSteps({
  onStartExercise,
  onOpenDiet,
  onAskQwony,
  onOpenTier,
  onUploadData,
}: HomeViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>오늘 할 일</Text>
          <Text style={styles.muted}>3개</Text>
        </View>
        <AppCard padding="none" style={styles.listCard}>
          <TodoRow
            description="시간과 장소만 고르면 돼요"
            Icon={BarbellIcon}
            onPress={onStartExercise}
            title="오늘 운동 추천 받기"
          />
          <View style={styles.divider} />
          <TodoRow
            description="사진 한 장이면 칼로리를 알려 드려요"
            Icon={ForkKnifeIcon}
            onPress={onOpenDiet}
            title="첫 끼니 기록하기"
          />
          <View style={styles.divider} />
          <QwonyRow description="운동 · 식단 궁금한 걸 편하게" onAsk={onAskQwony} />
        </AppCard>
      </View>

      <AppCard style={styles.tierStart}>
        <CoreBadge height={46} width={44} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>CORE 1부터 시작해요</Text>
          <Text style={styles.muted}>오늘 할 일을 마치면 티어 점수가 쌓여요</Text>
        </View>
        <AppButton fullWidth={false} onPress={onOpenTier} title="티어 보기" variant="outline" />
      </AppCard>

      <AppCard padding="lg" style={styles.uploadCard}>
        <ChartIcon color={colors.textPrimary} height={24} width={24} />
        <View style={styles.uploadText}>
          <Text style={styles.cardTitle}>건강 점수와 종합 분석</Text>
          <Text style={styles.muted}>
            건강검진 결과나 인바디 결과지를 올리면 내 몸 상태를 한눈에 보여 드려요.
          </Text>
        </View>
        <AppButton fullWidth={false} onPress={onUploadData} title="자료 올리기" variant="outline" />
      </AppCard>
    </>
  );
}

function RowIcon({ Icon }: { Icon: ComponentType<SvgProps> }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rowIcon}>
      <Icon color={colors.textPrimary} height={22} width={22} />
    </View>
  );
}

function TodoRow({
  title,
  description,
  Icon,
  onPress,
}: {
  title: string;
  description: string;
  Icon: ComponentType<SvgProps>;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <ListRow
      description={description}
      leftElement={<RowIcon Icon={Icon} />}
      onPress={onPress}
      rightElement={<CaretRightIcon color={colors.textSecondary} height={20} width={20} />}
      style={styles.row}
      title={title}
    />
  );
}

// Opens the Qwony chat from the row's own position, so the popup grows out of it.
function QwonyRow({
  description,
  onAsk,
  standalone = false,
}: {
  description: string;
  onAsk: (anchor: AIChatButtonAnchor) => void;
  standalone?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const ref = useRef<View>(null);
  const ask = () =>
    ref.current?.measureInWindow((x, y, width, height) =>
      onAsk({ height, side: 'right', width, x, y }),
    );
  const row = (
    <View ref={ref} collapsable={false}>
      <ListRow
        description={description}
        leftElement={<RowIcon Icon={ChatsIcon} />}
        onPress={ask}
        rightElement={<CaretRightIcon color={colors.textSecondary} height={20} width={20} />}
        style={styles.row}
        title="쿼니에게 물어보기"
      />
    </View>
  );
  return standalone ? (
    <AppCard padding="none" style={styles.listCard}>
      {row}
    </AppCard>
  ) : (
    row
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    greeting: { gap: 4 },
    date: { ...text.body2, color: colors.textSecondary },
    hello: { ...text.title1, color: colors.textPrimary },
    muted: { ...text.body2, color: colors.textSecondary },
    note: { ...text.body2, color: colors.textBody },
    link: { ...text.body2Strong, color: colors.primaryText },
    cardLabel: { ...text.body2, color: colors.textSecondary },
    cardTitle: { ...text.body1Strong, color: colors.textPrimary },
    valueRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    bigValue: { ...text.title1, color: colors.textPrimary },
    unit: { ...text.body2, color: colors.textSecondary },
    change: { ...text.body2Strong, color: colors.textBody },
    scoreCard: { gap: 12, paddingVertical: 18 },
    scoreTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    cardFoot: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    todayRow: { flexDirection: 'row', gap: 12 },
    todayCard: { flex: 1, gap: 8 },
    weekCard: { gap: 14, paddingHorizontal: 18, paddingVertical: 18 },
    spread: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    day: { alignItems: 'center', gap: 6 },
    dayMark: {
      alignItems: 'center',
      backgroundColor: colors.elevated,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    dayDone: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    dayToday: { borderColor: colors.textPrimary, borderWidth: 1.5 },
    dayLabel: { ...text.body2, color: colors.textSecondary },
    dayLabelToday: { ...text.body2Strong, color: colors.textPrimary },
    listCard: { overflow: 'hidden', paddingVertical: 2 },
    row: { paddingHorizontal: 16 },
    rowIcon: {
      alignItems: 'center',
      backgroundColor: colors.elevated,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    divider: { backgroundColor: colors.border, height: 1 },
    section: { gap: 12 },
    sectionTitleRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8 },
    sectionTitle: { ...text.title2, color: colors.textPrimary },
    tierStart: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    uploadCard: { alignItems: 'flex-start', gap: 12 },
    uploadText: { gap: 4 },
  } as const;
}
