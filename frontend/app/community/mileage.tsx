import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityErrorMessage,
  getCommunityMileage,
  getCommunityMileageHistory,
  isProvisionalNote,
  type CommunityMileage,
  type CommunityMileageEntry,
  type CommunityRule,
} from '@/src/api/community';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import {
  fontFamilies,
  radius,
  spacing,
  typography,
  useAppTheme,
  useThemedStyles,
  type AppTheme,
} from '@/src/theme';

const REASONS: Record<CommunityMileageEntry['reason'], string> = {
  challenge: '챌린지 보상',
  club_create: '클럽 개설',
  meal_log: '식단 기록',
  workout: '운동 완료',
};

function describeRule(rule: CommunityRule) {
  const amount = rule.amount.toLocaleString();
  switch (rule.rule_key) {
    case 'earn_workout':
      return `운동 완료 1회 +${amount}${rule.daily_limit !== null ? ` (하루 ${rule.daily_limit}회까지)` : ''}`;
    case 'earn_meal_log':
      return `식단 기록 1건 +${amount}${rule.daily_limit !== null ? ` (하루 ${rule.daily_limit}건까지)` : ''}`;
    case 'club_create_cost':
      return `클럽 개설 -${amount} (유료 회원은 무료)`;
    case 'membership_demo_days':
      return `시연용 유료 회원 ${amount}일`;
  }
}

export default function CommunityMileageScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<CommunityMileage | null>(null);
  const [entries, setEntries] = useState<CommunityMileageEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  // The summary call also credits new workouts and meals, so it runs before the history.
  const load = useCallback(async () => {
    try {
      const nextSummary = await getCommunityMileage();
      const page = await getCommunityMileageHistory();
      setSummary(nextSummary);
      setEntries(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await getCommunityMileageHistory(cursor);
      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.entry_id));
        return [...current, ...page.items.filter((entry) => !seen.has(entry.entry_id))];
      });
      setCursor(page.next_cursor);
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  // Earning first, then spending; the demo membership has its own screen.
  const order: CommunityRule['rule_key'][] = ['earn_workout', 'earn_meal_log', 'club_create_cost'];
  const earnRules = order.flatMap(
    (key) => summary?.rules.filter((rule) => rule.rule_key === key) ?? [],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="마일리지" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton
            fullWidth={false}
            onPress={() => {
              setErrorMessage(undefined);
              void load();
            }}
            title="다시 시도"
          />
        </View>
      ) : summary === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          data={entries}
          keyExtractor={(entry) => entry.entry_id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              아직 내역이 없어요. 운동을 완료하거나 식단을 기록하면 쌓여요.
            </Text>
          }
          ListHeaderComponent={
            <View style={styles.top}>
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>내 마일리지</Text>
                <Text style={styles.balance}>{summary.balance.toLocaleString()}점</Text>
                <Text style={styles.today}>오늘 적립 +{summary.earned_today.toLocaleString()}</Text>
              </View>
              <View style={styles.rules}>
                <Text style={styles.rulesTitle}>쌓고 쓰는 방법</Text>
                {earnRules.map((rule) => (
                  <Text key={rule.rule_key} style={[styles.rule, !rule.enabled && styles.ruleOff]}>
                    · {describeRule(rule)}
                    {rule.enabled ? '' : ' (지금은 꺼짐)'}
                  </Text>
                ))}
                <Text style={styles.rulesNote}>
                  {earnRules.some((rule) => isProvisionalNote(rule.note))
                    ? '숫자는 팀에서 정하기 전 임시값이라 바뀔 수 있어요. '
                    : ''}
                  마일리지 화면을 열 때 운동 완료와 식단 기록을 확인해 적립해요.
                </Text>
              </View>
              <Text style={styles.historyTitle}>내역</Text>
            </View>
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
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
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.reason}>{REASONS[item.reason]}</Text>
                <Text style={styles.time}>{formatCommunityTime(item.created_at)}</Text>
              </View>
              <Text style={[styles.amount, item.amount < 0 && styles.spent]}>
                {item.amount > 0 ? '+' : ''}
                {item.amount.toLocaleString()}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    message: {
      alignItems: 'center',
      flex: 1,
      gap: spacing.md,
      justifyContent: 'center',
      padding: spacing.xxl,
    },
    messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
    top: { gap: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
    balanceCard: {
      backgroundColor: colors.primaryLight,
      borderRadius: radius.lg,
      gap: 2,
      padding: spacing.xl,
    },
    balanceLabel: {
      color: colors.primaryPressed,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 14,
    },
    balance: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 30 },
    today: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
    rules: { gap: 4 },
    rulesTitle: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
      marginBottom: 2,
    },
    rule: { ...typography.body, color: colors.textBody },
    ruleOff: { color: colors.textSecondary, textDecorationLine: 'line-through' },
    rulesNote: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 },
    historyTitle: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
    },
    empty: {
      ...typography.body,
      color: colors.textSecondary,
      padding: spacing.xl,
      textAlign: 'center',
    },
    row: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    rowBody: { flex: 1, gap: 2 },
    reason: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardSemiBold,
      fontSize: 15,
    },
    time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
    amount: { color: colors.primaryPressed, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    spent: { color: colors.danger },
  } as const;
}
