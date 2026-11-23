import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityErrorMessage,
  getCommunityMileage,
  getCommunityRanking,
  setCommunityRankingParticipation,
  type CommunityRanking,
  type CommunityRankingMetric,
  type CommunityRankingScope,
} from '@/src/api/community';
import { ALoading } from '@/src/components/a/ALoading';
import { aForm } from '@/src/components/a/form';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { CommunityAvatar } from '@/src/components/community';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { fontFamilies, spacing, useThemedStyles, type AppTheme } from '@/src/theme';
import { COMMUNITY_RANKING_ENABLED } from '@/src/features/community/communityFeatures';

const METRICS: { label: string; unit: string; value: CommunityRankingMetric }[] = [
  { label: '운동 횟수', unit: '회', value: 'workout' },
  { label: '마일리지', unit: '점', value: 'mileage' },
];

function shortDate(value: string) {
  const [, month, day] = value.split('-').map(Number);
  return `${month}/${day}`;
}

// Weekly ranking (Korean week, Monday to Sunday). Only people who opted in are listed.
// While the ranking is switched off, a direct link lands on the community tab instead.
export default function CommunityRankingRoute() {
  if (!COMMUNITY_RANKING_ENABLED) return <Redirect href="/community" />;
  return <CommunityRankingScreen />;
}

function CommunityRankingScreen() {
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ scope?: string; clubId?: string; clubName?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { handleError, notify } = actions;
  const [metric, setMetric] = useState<CommunityRankingMetric>('workout');
  const [scope, setScope] = useState<CommunityRankingScope>(
    params.scope === 'club' && params.clubId ? 'club' : 'all',
  );
  const [ranking, setRanking] = useState<CommunityRanking | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const scopes: { label: string; value: CommunityRankingScope }[] = [
    { label: '전체', value: 'all' },
    { label: '팔로잉', value: 'following' },
    ...(params.clubId ? [{ label: params.clubName ?? '클럽', value: 'club' as const }] : []),
  ];
  const unit = METRICS.find((item) => item.value === metric)?.unit ?? '';

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      // The mileage ranking counts credited mileage, so credit my own new activity first.
      if (metric === 'mileage') await getCommunityMileage().catch(() => undefined);
      const next = await getCommunityRanking(
        metric,
        scope,
        scope === 'club' ? params.clubId : undefined,
      );
      if (id !== request.current) return;
      setRanking(next);
      setErrorMessage(undefined);
    } catch (error) {
      if (id === request.current) setErrorMessage(getCommunityErrorMessage(error));
    }
  }, [metric, params.clubId, scope]);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const toggleParticipation = async () => {
    if (!ranking || busy) return;
    const next = !ranking.participating;
    setBusy(true);
    try {
      await setCommunityRankingParticipation(next);
      notify(
        next
          ? '랭킹에 참여했어요. 이번 주 기록이 다른 사람에게 보여요.'
          : '랭킹 참여를 그만뒀어요.',
      );
      await load();
    } catch (error) {
      handleError(error, undefined, () => void toggleParticipation());
    } finally {
      setBusy(false);
    }
  };

  const chips = <T extends string>(
    items: { label: string; value: T }[],
    selected: T,
    onSelect: (value: T) => void,
  ) => (
    <View style={styles.chips}>
      {items.map((item) => (
        <Pressable
          accessibilityRole="button"
          aria-selected={item.value === selected}
          key={item.value}
          onPress={() => {
            if (item.value === selected) return;
            setRanking(null);
            onSelect(item.value);
          }}
          style={[styles.chip, item.value === selected && styles.chipActive]}
        >
          <Text
            numberOfLines={1}
            style={[styles.chipText, item.value === selected && styles.chipTextActive]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const header = (
    <View style={styles.header}>
      {chips(METRICS, metric, setMetric)}
      {chips(scopes, scope, setScope)}
      {ranking ? (
        <>
          <Text style={styles.week}>
            {shortDate(ranking.week_start)}~{shortDate(ranking.week_end)} 이번 주
          </Text>
          <View style={styles.optIn}>
            <Text style={styles.optInText}>
              {ranking.participating
                ? ranking.me
                  ? `내 순위 ${ranking.me.rank}위 · ${ranking.me.score.toLocaleString()}${unit}`
                  : '랭킹에 참여 중이에요. 이 범위에서는 아직 내 순위가 없어요.'
                : '랭킹은 참여를 켠 사람만 보여요. 참여하면 이번 주 운동 횟수와 마일리지가 다른 사람에게 보여요.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void toggleParticipation()}
            >
              <Text style={[styles.optInButton, ranking.participating && styles.optOutButton]}>
                {ranking.participating ? '참여 그만하기' : '랭킹 참여하기'}
              </Text>
            </Pressable>
          </View>
          {metric === 'mileage' ? (
            <Text style={styles.note}>
              마일리지는 각자 마일리지 화면을 열었을 때 적립된 만큼 반영돼요.
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="이번 주 랭킹" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
          data={ranking?.items ?? []}
          keyExtractor={(item) => item.user_id}
          ListEmptyComponent={
            ranking === null ? (
              <ALoading />
            ) : (
              <View style={styles.message}>
                <Text style={styles.messageText}>아직 이번 주 순위가 없어요.</Text>
              </View>
            )
          }
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`${item.rank}위 ${item.nickname} ${item.score}${unit}`}
              onPress={() =>
                router.push({
                  params: { userId: item.user_id },
                  pathname: '/community/user/[userId]',
                })
              }
              style={[styles.row, item.is_me && styles.rowMe]}
            >
              <Text style={[styles.rank, item.rank <= 3 && styles.rankTop]}>{item.rank}</Text>
              <CommunityAvatar author={item} size={36} />
              <Text numberOfLines={1} style={styles.nickname}>
                {item.nickname}
                {item.is_me ? ' (나)' : ''}
              </Text>
              <Text style={styles.score}>
                {item.score.toLocaleString()}
                {unit}
              </Text>
            </Pressable>
          )}
        />
      )}
      {actions.elements}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    header: { gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: { ...a.chip, maxWidth: 160, paddingHorizontal: 14 },
    chipActive: { backgroundColor: colors.primary },
    chipText: a.chipText,
    chipTextActive: { color: colors.onPrimary },
    week: a.note,
    optIn: { ...a.card, backgroundColor: colors.surfaceMuted, gap: spacing.xs, padding: spacing.lg },
    optInText: { ...a.p15, color: colors.textPrimary },
    optInButton: { ...a.p15, color: colors.textPrimary, textDecorationLine: 'underline' },
    optOutButton: a.link,
    note: a.note,
    row: { alignItems: 'center', borderBottomColor: colors.surfaceMuted, borderBottomWidth: 2, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    rowMe: { backgroundColor: colors.surfaceMuted },
    rank: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 26, textAlign: 'center', width: 32 },
    // the top three in gold, A's colour for points
    rankTop: { color: colors.textPrimary },
    nickname: { ...a.p15, color: colors.textPrimary, flex: 1 },
    score: { ...a.p15, color: colors.textPrimary },
    message: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xxl },
    messageText: { ...a.p15, color: colors.textPrimary, textAlign: 'center' },
  } as const;
}
