import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityErrorMessage,
  getCommunityFollowList,
  type CommunityFollowKind,
  type CommunityFollowUser,
} from '@/src/api/community';
import { AppButton, AppHeader } from '@/src/components/common';
import { CommunityAvatar, CommunityFollowButton } from '@/src/components/community';
import { subscribeCommunityEvents } from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, spacing, typography } from '@/src/theme';

const TABS: { kind: CommunityFollowKind; label: string }[] = [
  { kind: 'followers', label: '팔로워' },
  { kind: 'following', label: '팔로잉' },
];

export default function CommunityFollowsScreen() {
  const params = useLocalSearchParams<{ userId: string; kind?: string; nickname?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [kind, setKind] = useState<CommunityFollowKind>(
    params.kind === 'following' ? 'following' : 'followers',
  );
  const [users, setUsers] = useState<CommunityFollowUser[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const loadingMoreRef = useRef(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const page = await getCommunityFollowList(params.userId, kind);
      if (id !== request.current) return;
      setUsers(page.items);
      setCursor(page.next_cursor);
    } catch (error) {
      if (id === request.current) setErrorMessage(getCommunityErrorMessage(error));
    }
  }, [kind, params.userId]);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  useEffect(
    () =>
      subscribeCommunityEvents((event) => {
        if (event.type === 'followed') {
          setUsers(
            (current) =>
              current?.map((user) =>
                user.user_id === event.userId ? { ...user, followed_by_me: event.following } : user,
              ) ?? null,
          );
        }
        if (event.type === 'blocked') {
          setUsers((current) => current?.filter((user) => user.user_id !== event.userId) ?? null);
        }
      }),
    [],
  );

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const id = request.current;
    try {
      const page = await getCommunityFollowList(params.userId, kind, cursor);
      if (id !== request.current) return;
      setUsers((current) => {
        const seen = new Set(current?.map((user) => user.user_id));
        return [...(current ?? []), ...page.items.filter((user) => !seen.has(user.user_id))];
      });
      setCursor(page.next_cursor);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const switchTab = (next: CommunityFollowKind) => {
    if (next === kind) return;
    setUsers(null);
    setCursor(null);
    setErrorMessage(undefined);
    setKind(next);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title={params.nickname ?? '팔로우'} />
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            accessibilityRole="tab"
            aria-selected={tab.kind === kind}
            key={tab.kind}
            onPress={() => switchTab(tab.kind)}
            style={[styles.tab, tab.kind === kind && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab.kind === kind && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
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
      ) : users === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          data={users}
          keyExtractor={(user) => user.user_id}
          ListEmptyComponent={
            <View style={styles.message}>
              <Text style={styles.messageText}>
                {kind === 'followers' ? '아직 팔로워가 없어요.' : '아직 팔로우한 사람이 없어요.'}
              </Text>
            </View>
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                accessibilityLabel={`${item.nickname}님 프로필`}
                accessibilityRole="link"
                onPress={() =>
                  router.push({
                    params: { userId: item.user_id },
                    pathname: '/community/user/[userId]',
                  })
                }
                style={styles.person}
              >
                <CommunityAvatar author={item} size={40} />
                <Text numberOfLines={1} style={styles.nickname}>
                  {item.nickname}
                  {item.is_me ? ' (나)' : ''}
                </Text>
              </Pressable>
              {item.is_me ? null : (
                <CommunityFollowButton
                  following={item.followed_by_me}
                  nickname={item.nickname}
                  onPress={() => void actions.toggleFollow(item)}
                />
              )}
            </View>
          )}
        />
      )}
      {actions.elements}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  tabs: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  tab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    paddingVertical: spacing.md,
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  tabTextActive: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  person: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  nickname: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
  },
});
