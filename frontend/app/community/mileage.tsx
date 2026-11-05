import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import {
  getCommunityErrorMessage,
  getCommunityMileage,
  getCommunityMileageMonthly,
  getCommunityMileageHistory,
  isProvisionalNote,
  type CommunityMileage,
  type CommunityMileageMonthly,
  type CommunityMileageEntry,
  type CommunityRule,
} from '@/src/api/community';
import { AppButton, Text } from '@/src/components/common';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type HistoryFilter = '전체' | '적립' | '사용';
const FILTERS: HistoryFilter[] = ['전체', '적립', '사용'];

const REASONS: Record<CommunityMileageEntry['reason'], string> = {
  challenge: '챌린지 보상',
  club_create: '클럽 개설',
  meal_log: '식단 기록',
  workout: '운동 완료',
  workout_high_adjustment: '고강도 운동 추가 적립',
  workout_streak_5: '운동 5일 연속 달성',
  workout_streak_30: '운동 30일 연속 달성',
};

function describeRule(rule: CommunityRule) {
  switch (rule.rule_key) {
    case 'earn_workout':
      return '운동 완료';
    case 'earn_workout_high':
      return '고강도 운동 완료일 총 적립';
    case 'earn_streak_5':
      return '운동 5일 연속 달성';
    case 'earn_streak_30':
      return '운동 30일 연속 달성';
    case 'earn_meal_log':
      return '식단 기록';
    case 'club_create_cost':
      return '클럽 개설';
    case 'membership_demo_days':
      return '시연용 유료 회원';
  }
}

export default function CommunityMileageScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<CommunityMileage | null>(null);
  const [monthly, setMonthly] = useState<CommunityMileageMonthly | null>(null);
  const [entries, setEntries] = useState<CommunityMileageEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('전체');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  // The summary call also credits new workouts and meals, so it runs before the history.
  const load = useCallback(async () => {
    try {
      const nextSummary = await getCommunityMileage();
      const [page, monthlyResult] = await Promise.all([
        getCommunityMileageHistory(), getCommunityMileageMonthly().catch(() => null),
      ]);
      setSummary(nextSummary);
      setMonthly(monthlyResult);
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
  const order: CommunityRule['rule_key'][] = [
    'earn_workout',
    'earn_workout_high',
    'earn_streak_5',
    'earn_streak_30',
    'earn_meal_log',
  ];
  const earnRules = order.flatMap(
    (key) => summary?.rules.filter((rule) => rule.rule_key === key && rule.enabled) ?? [],
  );
  const visibleEntries = entries.filter(
    (entry) => filter === '전체' || (filter === '적립' ? entry.amount > 0 : entry.amount < 0),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="뒤로"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.back}
        >
          <CaretLeftIcon color={colors.textPrimary} height={24} width={24} />
        </Pressable>
        <Text style={styles.headerTitle}>마일리지</Text>
      </View>
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          data={visibleEntries}
          keyExtractor={(entry) => entry.entry_id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {entries.length === 0 ? '아직 마일리지 내역이 없어요.' : `${filter} 내역이 없어요.`}
            </Text>
          }
          ListHeaderComponent={
            <View style={styles.top}>
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>내 마일리지</Text>
                <Text style={styles.balance}>{summary.balance.toLocaleString()}P</Text>
                <Text style={styles.balanceHelp}>운동과 식단 기록으로 쌓은 마일리지예요.</Text>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>이번 달 적립</Text>
                    <Text style={styles.statValue}>{monthly ? `+${monthly.earned_this_month.toLocaleString()}P` : '—'}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>지난달 적립</Text>
                    <Text style={styles.statValue}>{monthly ? `+${monthly.earned_last_month.toLocaleString()}P` : '—'}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>이번 달 사용</Text>
                    <Text style={styles.statValue}>{monthly ? `-${monthly.spent_this_month.toLocaleString()}P` : '—'}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.rulesTitle}>쌓는 방법</Text>
              <View style={styles.rules}>
                {earnRules.map((rule, index) => (
                  <View key={rule.rule_key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.ruleRow}>
                      <Text style={styles.rule}>{describeRule(rule)}</Text>
                      <Text style={styles.ruleAmount}>+{rule.amount.toLocaleString()}P</Text>
                    </View>
                  </View>
                ))}
                {earnRules.length === 0 ? <Text style={styles.emptyRules}>적립 규칙이 없어요.</Text> : null}
              </View>
              {earnRules.some((rule) => isProvisionalNote(rule.note)) ? (
                <Text style={styles.rulesNote}>적립 기준은 실사용 테스트를 거쳐 조정할 예정이에요.</Text>
              ) : null}
              <View style={styles.historyHeading}>
              <Text style={styles.historyTitle}>내역</Text>
              <View style={styles.filters}>
                {FILTERS.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === option }}
                    onPress={() => setFilter(option)}
                    style={[styles.filter, filter === option && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, filter === option && styles.filterTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
              </View>
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
                <Text style={styles.reason}>{REASONS[item.reason] ?? '마일리지 변경'}</Text>
                <Text style={styles.time}>{formatCommunityTime(item.created_at)}</Text>
              </View>
              <Text style={[styles.amount, item.amount < 0 && styles.spent]}>
                {item.amount > 0 ? '+' : ''}
                {item.amount.toLocaleString()}P
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
    header: { alignItems: 'center', height: 56, justifyContent: 'center' },
    back: { left: 20, position: 'absolute', top: 16 },
    headerTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
    message: {
      alignItems: 'center',
      flex: 1,
      gap: 16,
      justifyContent: 'center',
      padding: 28,
    },
    messageText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
    top: { gap: 17, paddingHorizontal: 20, paddingTop: 8 },
    balanceCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      padding: 18,
    },
    balanceLabel: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
    },
    balance: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 30, marginTop: 2 },
    balanceHelp: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12, marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 6, marginTop: 16 },
    stat: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, minWidth: 0, padding: 9 },
    statLabel: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    statValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, marginTop: 4 },
    rules: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: -6, paddingHorizontal: 14 },
    rulesTitle: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
    },
    ruleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
    rule: { color: colors.textBody, flex: 1, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    ruleAmount: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
    divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
    emptyRules: { color: colors.textSecondary, fontSize: 14, paddingVertical: 14 },
    rulesNote: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12, marginTop: -9 },
    historyTitle: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 16,
    },
    historyHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    filters: { flexDirection: 'row', gap: 6 },
    filter: { backgroundColor: colors.background, alignItems: 'center', borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', minWidth: 45, paddingHorizontal: 12 },
    filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    filterTextActive: { color: '#FFFFFF' },
    empty: {
      color: colors.textSecondary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 14,
      padding: 24,
      textAlign: 'center',
    },
    row: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      marginHorizontal: 20,
      minHeight: 60,
      paddingVertical: 8,
    },
    rowBody: { flex: 1, gap: 3 },
    reason: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
    amount: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
    spent: { color: colors.textSecondary },
  } as const;
}
