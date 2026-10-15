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
  getCommunityClubs,
  getCommunityErrorMessage,
  type CommunityClub,
} from '@/src/api/community';
import { AppButton } from '@/src/components/common';
import { CommunityClubCard } from '@/src/components/community';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

type Scope = 'all' | 'mine';

const SCOPES: { label: string; value: Scope }[] = [
  { label: '전체 클럽', value: 'all' },
  { label: '내 클럽', value: 'mine' },
];

// The 클럽 tab of the community screen. Reloads when the screen comes back into view, so a
// club created or joined elsewhere shows up.
export function CommunityClubsPane({ bottomSpace }: { bottomSpace: number }) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('all');
  const [clubs, setClubs] = useState<CommunityClub[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const page = await getCommunityClubs(scope);
      if (id !== request.current) return;
      setClubs(page.items);
      setCursor(page.next_cursor);
      setErrorMessage(undefined);
    } catch (error) {
      if (id === request.current) setErrorMessage(getCommunityErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [scope]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const id = request.current;
    try {
      const page = await getCommunityClubs(scope, cursor);
      if (id !== request.current) return;
      setClubs((current) => {
        const seen = new Set(current?.map((club) => club.club_id));
        return [...(current ?? []), ...page.items.filter((club) => !seen.has(club.club_id))];
      });
      setCursor(page.next_cursor);
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const switchScope = (next: Scope) => {
    if (next === scope) return;
    setClubs(null);
    setCursor(null);
    setScope(next);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.chips}>
        {SCOPES.map((item) => (
          <Pressable
            accessibilityRole="button"
            aria-selected={item.value === scope}
            key={item.value}
            onPress={() => switchScope(item.value)}
            style={[styles.chip, item.value === scope && styles.chipActive]}
          >
            <Text style={[styles.chipText, item.value === scope && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <AppButton
        fullWidth={false}
        onPress={() => router.push('/community/club/new')}
        title="클럽 만들기"
      />
    </View>
  );

  if (errorMessage) {
    return (
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
    );
  }

  return (
    <FlatList
      contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomSpace + spacing.xl }}
      data={clubs ?? []}
      keyExtractor={(club) => club.club_id}
      ListEmptyComponent={
        clubs === null ? (
          <ActivityIndicator color={colors.primary} style={styles.message} />
        ) : (
          <View style={styles.message}>
            <Text style={styles.messageText}>
              {scope === 'mine'
                ? '아직 가입한 클럽이 없어요.\n전체 클럽에서 마음에 드는 모임에 가입해 보세요.'
                : '아직 만들어진 클럽이 없어요.\n관심사가 같은 사람들과 첫 클럽을 만들어 보세요!'}
            </Text>
          </View>
        )
      }
      ListHeaderComponent={header}
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
        <CommunityClubCard
          club={item}
          onPress={() =>
            router.push({ params: { clubId: item.club_id }, pathname: '/community/club/[clubId]' })
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  chips: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  chipTextActive: { color: colors.surface },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
