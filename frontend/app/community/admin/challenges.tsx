import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityAdminChallenges,
  getCommunityErrorMessage,
  type CommunityAdminChallenge,
} from '@/src/api/community';
import { koreanDate } from '@/src/lib/koreanDate';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';

const METRIC: Record<CommunityAdminChallenge['metric'], string> = {
  meal_log_days: '식단 기록한 날',
  workout_days: '운동한 날',
};

// Every challenge, switched off and ended ones included. Reloads after editing.
export default function CommunityAdminChallengesScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
                {koreanDate(item.starts_on)} ~ {koreanDate(item.ends_on)} · {METRIC[item.metric]} {item.goal}일 · 보상 +
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

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    message: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    header: { padding: 16, paddingBottom: 8 },
    empty: { ...a.p15, color: colors.textBody, padding: 20, textAlign: 'center' },
    card: { ...a.card, gap: 4, marginHorizontal: 16, marginTop: 12, padding: 14 },
    pressed: { transform: [{ translateY: 4 }] },
    titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    title: { ...a.p15, color: colors.textPrimary, flex: 1 },
    badge: { ...a.p12, backgroundColor: colors.surfaceMuted, borderRadius: 99, color: colors.textPrimary, overflow: 'hidden', paddingHorizontal: 8 },
    badgeOff: { backgroundColor: colors.surfaceMuted, color: colors.textSecondary },
    meta: { ...a.p12, color: colors.textBody },
    note: a.note,
  } as const;
}
