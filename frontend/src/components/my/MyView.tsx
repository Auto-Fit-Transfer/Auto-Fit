import type { ComponentType, ReactNode } from 'react';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChartIcon from '@/assets/icons/ui/chart-line-up.svg';
import UploadIcon from '@/assets/icons/ui/upload-simple.svg';
import UserIcon from '@/assets/icons/ui/user.svg';
import { AppButton, AppCard, ListRow, Text } from '@/src/components/common';
import { TabScreen } from '@/src/components/navigation';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

export interface MyViewProps {
  name: string;
  joinedDays: number | null;
  stats: { posts: number; followers: number; following: number } | null;
  mileage: number | null;
  onEditProfile: () => void;
  onOpenPosts: () => void;
  onOpenFollowers: () => void;
  onOpenFollowing: () => void;
  onOpenMileage: () => void;
  onUploadData: () => void;
  onOpenReport: () => void;
  onOpenGoal: () => void;
  onOpenExerciseSettings: () => void;
  onOpenDietSettings: () => void;
  onOpenDisplaySettings: () => void;
  onOpenAccount: () => void;
  onOpenNotifications: () => void;
  onLogout: () => void;
}

type Row = { title: string; description?: string; onPress: () => void; danger?: boolean };

// My tab, Figma G1.
export function MyView(props: MyViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { name, joinedDays, stats, mileage } = props;

  return (
    <TabScreen gap={14} title="마이">
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <UserIcon color={colors.textSecondary} height={28} width={28} />
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {joinedDays !== null ? <Text style={styles.muted}>함께한 지 {joinedDays}일</Text> : null}
        </View>
        <AppButton
          fullWidth={false}
          onPress={props.onEditProfile}
          title="프로필 수정"
          variant="outline"
        />
      </View>

      <AppCard style={styles.stats}>
        <Stat label="글" onPress={props.onOpenPosts} value={stats?.posts} />
        <View style={styles.statDivider} />
        <Stat label="팔로워" onPress={props.onOpenFollowers} value={stats?.followers} />
        <View style={styles.statDivider} />
        <Stat label="팔로잉" onPress={props.onOpenFollowing} value={stats?.following} />
      </AppCard>

      <Pressable accessibilityRole="button" onPress={props.onOpenMileage}>
        <AppCard style={styles.mileage}>
          <Text style={styles.mileageLabel}>마일리지</Text>
          <Text style={styles.mileageValue}>
            {mileage === null ? '—' : `${mileage.toLocaleString('ko-KR')}P`}
          </Text>
          <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
        </AppCard>
      </Pressable>

      <Text style={styles.groupTitle}>내 건강</Text>
      <View style={styles.healthRow}>
        <HealthCard
          description="새 검진표 · 체성분 결과"
          Icon={UploadIcon}
          onPress={props.onUploadData}
          title="건강 데이터 올리기"
        />
        <HealthCard
          description="검진 · 인바디 변화"
          Icon={ChartIcon}
          onPress={props.onOpenReport}
          title="건강 리포트"
        />
      </View>

      <Text style={styles.groupTitle}>맞춤 추천</Text>
      <RowGroup
        rows={[
          {
            title: '건강 목표 설정',
            description: '운동 목표와 주간 횟수',
            onPress: props.onOpenGoal,
          },
          {
            title: '운동 설정',
            description: '오늘의 운동 설정으로 이동',
            onPress: props.onOpenExerciseSettings,
          },
          {
            title: '식단 설정',
            description: '알레르기 · 피해야 하는 음식',
            onPress: props.onOpenDietSettings,
          },
        ]}
      />

      <Text style={styles.groupTitle}>설정 · 활동</Text>
      <RowGroup
        rows={[
          { title: '계정 설정', onPress: props.onOpenAccount },
          { title: '알림 설정', onPress: props.onOpenNotifications },
          {
            title: '화면 설정',
            description: '밝게 · 어둡게 · 간편 모드',
            onPress: props.onOpenDisplaySettings,
          },
          {
            title: '커뮤니티 활동',
            description: '쓴 글 · 팔로워 · 팔로잉',
            onPress: props.onOpenPosts,
          },
          { title: '로그아웃', onPress: props.onLogout, danger: true },
        ]}
      />
    </TabScreen>
  );
}

function Stat({ label, value, onPress }: { label: string; value?: number; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.stat}>
      <Text style={styles.statValue}>{value === undefined ? '—' : value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </Pressable>
  );
}

function HealthCard({
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
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.flex}>
      <AppCard style={styles.healthCard}>
        <View style={styles.healthIcon}>
          <Icon color={colors.textPrimary} height={20} width={20} />
        </View>
        <View style={styles.healthText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.muted}>{description}</Text>
        </View>
      </AppCard>
    </Pressable>
  );
}

function RowGroup({ rows }: { rows: Row[] }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const items: ReactNode[] = rows.map((row, index) => (
    <Fragment key={row.title}>
      {index > 0 ? <View style={styles.divider} /> : null}
      <ListRow
        danger={row.danger}
        description={row.description}
        onPress={row.onPress}
        rightElement={<CaretRightIcon color={colors.textSecondary} height={20} width={20} />}
        style={styles.row}
        title={row.title}
      />
    </Fragment>
  ));
  return (
    <AppCard padding="none" style={styles.group}>
      {items}
    </AppCard>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    profile: { alignItems: 'center', flexDirection: 'row', gap: 14 },
    avatar: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 28,
      height: 56,
      justifyContent: 'center',
      width: 56,
    },
    name: { ...text.title2, color: colors.textPrimary },
    muted: { ...text.body2, color: colors.textSecondary },
    stats: { alignItems: 'center', flexDirection: 'row', paddingVertical: 12 },
    stat: { alignItems: 'center', flex: 1, gap: 2 },
    statValue: { ...text.title2, color: colors.textPrimary },
    statDivider: { backgroundColor: colors.border, height: 32, width: 1 },
    mileage: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    mileageLabel: { ...text.body1, color: colors.textPrimary, flex: 1 },
    mileageValue: { ...text.body1Strong, color: colors.textPrimary },
    groupTitle: { ...text.body2Strong, color: colors.textSecondary, marginTop: 4 },
    healthRow: { flexDirection: 'row', gap: 10 },
    healthCard: { gap: 10 },
    healthIcon: {
      alignItems: 'center',
      backgroundColor: colors.elevated,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    healthText: { gap: 2 },
    cardTitle: { ...text.body1Strong, color: colors.textPrimary },
    group: { overflow: 'hidden', paddingVertical: 2 },
    row: { paddingHorizontal: 16 },
    divider: { backgroundColor: colors.border, height: 1 },
  } as const;
}
