import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View } from 'react-native';

import { koreanDate } from '@/src/lib/koreanDate';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import {
  claimCommunityChallenge,
  getCommunityChallenges,
  getCommunityErrorMessage,
  isProvisionalNote,
  setCommunityChallengeParticipation,
  type CommunityChallenge,
} from '@/src/api/community';
import { AppButton, Text } from '@/src/components/common';
import { fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';

import { COMMUNITY_RANKING_ENABLED } from './communityFeatures';
import { useCommunityActions } from './useCommunityActions';

const METRIC_UNIT: Record<CommunityChallenge['metric'], string> = {
  meal_log_days: '식단 기록한 날',
  workout_days: '운동한 날',
};

// The 챌린지 tab: provisional challenges counted from workout and meal records, and the way
// into the weekly ranking.
export function CommunityChallengesPane({ bottomSpace, onBack }: { bottomSpace: number; onBack: () => void }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.backRow}>
        <CaretLeftIcon color={colors.textPrimary} height={24} width={24} />
        <Text style={styles.paneTitle}>커뮤니티 챌린지</Text>
      </Pressable>
      {COMMUNITY_RANKING_ENABLED ? (
        <Pressable hitSlop={16}
          accessibilityRole="button"
          onPress={() => router.push('/community/ranking')}
          style={({ pressed }) => [styles.rankingCard, pressed && styles.pressed]}
        >
          <View style={styles.rankingBody}>
            <Text style={styles.rankingTitle}>이번 주 랭킹</Text>
            <Text style={styles.rankingText}>운동 횟수·마일리지 순위 (참여한 사람만 보여요)</Text>
          </View>
          <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
        </Pressable>
      ) : null}
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
              {koreanDate(item.starts_on)}~{koreanDate(item.ends_on)} · 보상 +
              {item.reward_mileage.toLocaleString()} · {item.participant_count.toLocaleString()}명
              참여
            </Text>
            {/* a circle a day while the goal is short enough to count by eye; a bar past that */}
            {item.goal <= 14 ? (
              <View accessibilityLabel={`${METRIC_UNIT[item.metric]} ${item.progress}/${item.goal}일`} accessible style={styles.days}>
                {Array.from({ length: item.goal }, (_, index) => (
                  <View key={index} style={[styles.day, index < item.progress && styles.dayDone]} />
                ))}
              </View>
            ) : (
              <View
                accessibilityLabel={`${METRIC_UNIT[item.metric]} ${item.progress}/${item.goal}일`}
                style={styles.progressTrack}
              >
                <View
                  style={[styles.progressFill, { width: `${Math.min(1, item.progress / item.goal) * 100}%` }]}
                />
              </View>
            )}
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

function createStyles({ colors }: AppTheme) {
  // Renewal B (b-community.html #vChals): each challenge a roomy white card, a black circle a day done.
  const a = aForm(colors);
  return {
    root: { flex: 1 },
    header: { gap: 10, paddingBottom: 4, paddingHorizontal: 20, paddingTop: 12 },
    backRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 },
    paneTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 26 },
    rankingCard: { ...a.card, alignItems: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16 },
    pressed: { opacity: 0.8 },
    rankingBody: { flex: 1, gap: 2 },
    rankingTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    rankingText: a.note,
    note: a.note,
    card: { ...a.card, gap: 10, marginHorizontal: 20, marginTop: 14, paddingHorizontal: 20, paddingVertical: 20 },
    titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    title: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 20, lineHeight: 27 },
    phase: { ...a.p12, backgroundColor: colors.surfaceMuted, borderRadius: 99, color: colors.textSecondary, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
    phaseOn: { backgroundColor: colors.primary, color: colors.onPrimary },
    description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
    meta: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    day: { backgroundColor: colors.surfaceMuted, borderRadius: 6, height: 12, width: 12 },
    dayDone: { backgroundColor: colors.textPrimary },
    progressTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 6, overflow: 'hidden', marginTop: 4 },
    progressFill: { backgroundColor: colors.textPrimary, height: '100%' },
    progressText: { ...a.p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, marginBottom: 4 },
    joinedRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    joinedText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    leave: a.link,
    done: { ...a.note, textAlign: 'center' },
    message: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
  } as const;
}
