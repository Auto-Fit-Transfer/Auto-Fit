import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  claimCommunityChallenge,
  getCommunityChallenges,
  getCommunityErrorMessage,
  isProvisionalNote,
  setCommunityChallengeParticipation,
  type CommunityChallenge,
} from '@/src/api/community';
import { AppButton } from '@/src/components/common';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

import { useCommunityActions } from './useCommunityActions';

const METRIC_UNIT: Record<CommunityChallenge['metric'], string> = {
  meal_log_days: '식단 기록한 날',
  workout_days: '운동한 날',
};

function shortDate(value: string) {
  const [, month, day] = value.split('-').map(Number);
  return `${month}/${day}`;
}

// The 챌린지 tab: provisional challenges counted from workout and meal records, and the way
// into the weekly ranking.
export function CommunityChallengesPane({ bottomSpace }: { bottomSpace: number }) {
  const router = useRouter();
  const actions = useCommunityActions();
  const { handleError, notify } = actions;
  const [challenges, setChallenges] = useState<CommunityChallenge[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      setChallenges(await getCommunityChallenges());
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const replace = (next: CommunityChallenge) =>
    setChallenges(
      (current) =>
        current?.map((item) => (item.challenge_id === next.challenge_id ? next : item)) ?? null,
    );

  const run = async (
    item: CommunityChallenge,
    task: () => Promise<CommunityChallenge>,
    done: string,
  ) => {
    if (busy.current.has(item.challenge_id)) return;
    busy.current.add(item.challenge_id);
    try {
      replace(await task());
      notify(done);
    } catch (error) {
      handleError(error);
    } finally {
      busy.current.delete(item.challenge_id);
    }
  };

  const renderAction = (item: CommunityChallenge) => {
    if (item.rewarded) {
      return <Text style={styles.done}>보상 받음 · +{item.reward_mileage.toLocaleString()}</Text>;
    }
    if (item.can_claim) {
      return (
        <AppButton
          onPress={() =>
            void run(
              item,
              () => claimCommunityChallenge(item.challenge_id),
              `마일리지 ${item.reward_mileage.toLocaleString()}점을 받았어요.`,
            )
          }
          title={`보상 받기 (+${item.reward_mileage.toLocaleString()})`}
        />
      );
    }
    if (item.joined) {
      return (
        <View style={styles.joinedRow}>
          <Text style={styles.joinedText}>참여 중</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              void run(
                item,
                () => setCommunityChallengeParticipation(item.challenge_id, false),
                '챌린지 참여를 취소했어요.',
              )
            }
          >
            <Text style={styles.leave}>참여 취소</Text>
          </Pressable>
        </View>
      );
    }
    if (item.phase === 'ended') return <Text style={styles.done}>끝난 챌린지예요</Text>;
    return (
      <AppButton
        onPress={() =>
          void run(
            item,
            () => setCommunityChallengeParticipation(item.challenge_id, true),
            '챌린지에 참여했어요. 기록하면 자동으로 쌓여요.',
          )
        }
        title="참여하기"
      />
    );
  };

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/community/ranking')}
        style={({ pressed }) => [styles.rankingCard, pressed && styles.pressed]}
      >
        <View style={styles.rankingBody}>
          <Text style={styles.rankingTitle}>이번 주 랭킹</Text>
          <Text style={styles.rankingText}>운동 횟수·마일리지 순위 (참여한 사람만 보여요)</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Text style={styles.note}>
        챌린지는 운동 완료·식단 기록으로 자동으로 쌓여요.
        {challenges?.some((item) => isProvisionalNote(item.note))
          ? ' 예시 챌린지의 기간·목표·보상은 팀에서 정하기 전 임시값이에요.'
          : ''}
      </Text>
    </View>
  );

  if (errorMessage) {
    return (
      <View style={styles.message}>
        <Text style={styles.messageText}>{errorMessage}</Text>
        <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomSpace + spacing.xl }}
        data={challenges ?? []}
        keyExtractor={(item) => item.challenge_id}
        ListEmptyComponent={
          challenges === null ? (
            <ActivityIndicator color={colors.primary} style={styles.message} />
          ) : (
            <View style={styles.message}>
              <Text style={styles.messageText}>지금 진행 중인 챌린지가 없어요.</Text>
            </View>
          )
        }
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.title} 챌린지 자세히 보기`} onPress={() => router.push({ pathname: '/community/challenge/[challengeId]', params: { challengeId: item.challenge_id } })} style={styles.titleRow}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={[styles.phase, item.phase === 'ongoing' && styles.phaseOn]}>
                {item.phase === 'ongoing' ? '진행 중' : item.phase === 'upcoming' ? '예정' : '종료'}
              </Text>
            </Pressable>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <Text style={styles.meta}>
              {shortDate(item.starts_on)}~{shortDate(item.ends_on)} · 보상 +
              {item.reward_mileage.toLocaleString()} · {item.participant_count.toLocaleString()}명
              참여
            </Text>
            <View
              accessibilityLabel={`${METRIC_UNIT[item.metric]} ${item.progress}/${item.goal}일`}
              style={styles.progressTrack}
            >
              <View
                style={[styles.progressFill, { width: `${(item.progress / item.goal) * 100}%` }]}
              />
            </View>
            <Text style={styles.progressText}>
              {METRIC_UNIT[item.metric]} {item.progress}/{item.goal}일
              {item.completed ? ' · 목표 달성!' : ''}
            </Text>
            {renderAction(item)}
          </View>
        )}
      />
      {actions.elements}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: spacing.sm, padding: spacing.xl, paddingBottom: spacing.sm },
  rankingCard: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    flexDirection: 'row',
    padding: spacing.lg,
  },
  pressed: { opacity: 0.8 },
  rankingBody: { flex: 1, gap: 2 },
  rankingTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 16,
  },
  rankingText: { ...typography.bodySmall, color: colors.textBody },
  chevron: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 22 },
  note: { ...typography.bodySmall, color: colors.textSecondary },
  card: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 17,
  },
  phase: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  phaseOn: { backgroundColor: colors.primaryLight, color: colors.primaryDark },
  description: { ...typography.body, color: colors.textBody },
  meta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 13 },
  progressTrack: {
    backgroundColor: colors.background,
    borderRadius: radius.round,
    height: 8,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: colors.primary, borderRadius: radius.round, height: 8 },
  progressText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  joinedRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  joinedText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
  },
  leave: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  done: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    textAlign: 'center',
  },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
