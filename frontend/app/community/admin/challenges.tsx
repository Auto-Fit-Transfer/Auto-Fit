import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityAdminChallenges,
  getCommunityErrorMessage,
  type CommunityAdminChallenge,
} from '@/src/api/community';
import { AppButton, AppHeader } from '@/src/components/common';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

const METRIC: Record<CommunityAdminChallenge['metric'], string> = {
  meal_log_days: '식단 기록한 날',
  workout_days: '운동한 날',
};

// Every challenge, switched off and ended ones included. Reloads after editing.
export default function CommunityAdminChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommunityAdminChallenge[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const load = useCallback(async () => {
    try {
      setItems(await getCommunityAdminChallenges());
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openForm = (challengeId?: string) =>
    router.push({
      params: challengeId ? { challengeId } : {},
      pathname: '/community/admin/challenge',
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="챌린지 관리" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : items === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          data={items}
          keyExtractor={(item) => item.challenge_id}
          ListEmptyComponent={<Text style={styles.empty}>아직 챌린지가 없어요.</Text>}
          ListHeaderComponent={
            <View style={styles.header}>
              <AppButton onPress={() => openForm()} title="새 챌린지 만들기" />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => openForm(item.challenge_id)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.title}>
                  {item.title}
                </Text>
                <Text style={[styles.badge, !item.enabled && styles.badgeOff]}>
                  {item.enabled ? '켜짐' : '꺼짐'}
                </Text>
              </View>
              <Text style={styles.meta}>
                {item.starts_on} ~ {item.ends_on} · {METRIC[item.metric]} {item.goal}일 · 보상 +
                {item.reward_mileage.toLocaleString()}
              </Text>
              <Text style={styles.meta}>
                참여 {item.participant_count.toLocaleString()}명 · 보상 받음{' '}
                {item.rewarded_count.toLocaleString()}명
                {item.locked ? ' · 목표·시작일·보상 고정' : ''}
              </Text>
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  header: { padding: spacing.xl, paddingBottom: spacing.sm },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    padding: spacing.xl,
    textAlign: 'center',
  },
  card: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  pressed: { backgroundColor: colors.background },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 16,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeOff: { backgroundColor: colors.background, color: colors.textSecondary },
  meta: { color: colors.textBody, fontFamily: fontFamilies.pretendardRegular, fontSize: 13 },
  note: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
});
