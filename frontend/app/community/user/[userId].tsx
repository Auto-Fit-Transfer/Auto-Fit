import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MoreIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import {
  getCommunityErrorMessage,
  getCommunityMembership,
  getCommunityMileage,
  getCommunityProfile,
  getCommunityUserPosts,
  type CommunityAuthor,
  type CommunityFollowKind,
  type CommunityPost,
  type CommunityProfile,
} from '@/src/api/community';
import { AppButton, AppHeader, IconButton } from '@/src/components/common';
import {
  CommunityAvatar,
  CommunityFollowButton,
  CommunityPostCard,
} from '@/src/components/community';
import {
  applyCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, spacing, typography } from '@/src/theme';

// userId may be 'me' (the server resolves it to the signed-in user).
export default function CommunityProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const focusedOnce = useRef(false);
  // Own profile only: mileage balance and membership, for the two shortcut rows.
  const [mine, setMine] = useState<{ balance?: number; member?: boolean }>({});

  const loadMine = useCallback(async () => {
    const [mileage, membership] = await Promise.allSettled([
      getCommunityMileage(),
      getCommunityMembership(),
    ]);
    setMine({
      balance: mileage.status === 'fulfilled' ? mileage.value.balance : undefined,
      member: membership.status === 'fulfilled' ? membership.value.active : undefined,
    });
  }, []);

  const load = useCallback(
    async (inlineError: boolean) => {
      try {
        const nextProfile = await getCommunityProfile(userId);
        const page = await getCommunityUserPosts(nextProfile.user_id);
        setProfile(nextProfile);
        if (nextProfile.is_me) void loadMine();
        setPosts(page.items);
        setCursor(page.next_cursor);
        setErrorMessage(undefined);
      } catch (error) {
        if (inlineError) setErrorMessage(getCommunityErrorMessage(error));
        else notify(getCommunityErrorMessage(error));
      } finally {
        setRefreshing(false);
      }
    },
    [loadMine, notify, userId],
  );

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  // Counts change on other screens (follow lists, posting); refresh them on return.
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      getCommunityProfile(userId).then(
        (next) => {
          setProfile(next);
          if (next.is_me) void loadMine();
        },
        () => undefined,
      );
    }, [loadMine, userId]),
  );

  const profileId = profile?.user_id;
  useEffect(
    () =>
      subscribeCommunityEvents((event) => {
        setPosts((current) => applyCommunityEvent(current, event));
        if (event.type === 'followed' && event.userId === profileId) {
          setProfile(
            (current) =>
              current && {
                ...current,
                followed_by_me: event.following,
                follower_count: event.followerCount ?? current.follower_count,
              },
          );
        }
        if (event.type === 'blocked' && event.userId === profileId) {
          setProfile(null);
          setErrorMessage('차단한 사용자예요. 커뮤니티 설정에서 차단을 풀 수 있어요.');
        }
      }),
    [profileId],
  );

  const loadMore = useCallback(async () => {
    if (!profile || !cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getCommunityUserPosts(profile.user_id, cursor);
      setPosts((current) => {
        const seen = new Set(current.map((item) => item.feed_item_id));
        return [...current, ...page.items.filter((item) => !seen.has(item.feed_item_id))];
      });
      setCursor(page.next_cursor);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cursor, notify, profile]);

  const openProfile = (author: CommunityAuthor) => {
    if (author.user_id === profile?.user_id) return;
    router.push({ params: { userId: author.user_id }, pathname: '/community/user/[userId]' });
  };

  const openFollows = (kind: CommunityFollowKind) =>
    profile &&
    router.push({
      params: { kind, nickname: profile.nickname, userId: profile.user_id },
      pathname: '/community/follows',
    });

  const header = profile ? (
    <View style={styles.profile}>
      <View style={styles.profileTop}>
        <CommunityAvatar author={profile} size={72} />
        <View style={styles.stats}>
          <Stat label="게시글" value={profile.post_count} />
          <Stat
            label="팔로워"
            onPress={() => openFollows('followers')}
            value={profile.follower_count}
          />
          <Stat
            label="팔로잉"
            onPress={() => openFollows('following')}
            value={profile.following_count}
          />
        </View>
      </View>
      <View style={styles.nameRow}>
        <Text numberOfLines={1} style={styles.name}>
          {profile.nickname}
        </Text>
        {profile.follows_me && !profile.is_me ? (
          <Text style={styles.badge}>나를 팔로우해요</Text>
        ) : null}
      </View>
      {profile.is_me ? (
        <View style={styles.myRows}>
          <MyRow
            label="마일리지"
            onPress={() => router.push('/community/mileage')}
            value={mine.balance === undefined ? '' : `${mine.balance.toLocaleString()}점`}
          />
          <MyRow
            label="유료 회원"
            onPress={() => router.push('/community/membership')}
            value={mine.member === undefined ? '' : mine.member ? '이용 중' : '미가입'}
          />
        </View>
      ) : (
        <CommunityFollowButton
          following={profile.followed_by_me}
          followsMe={profile.follows_me}
          nickname={profile.nickname}
          onPress={() => void actions.toggleFollow(profile, profile.follower_count)}
          wide
        />
      )}
    </View>
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader
        onBackPress={() => router.back()}
        rightAction={
          profile && !profile.is_me ? (
            <IconButton
              accessibilityLabel="신고·차단"
              icon={<MoreIcon color={colors.textBody} height={22} width={22} />}
              onPress={() => actions.openUserMenu(profile)}
              size={44}
            />
          ) : null
        }
        title={profile?.is_me ? '내 프로필' : (profile?.nickname ?? '프로필')}
      />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => router.back()} title="돌아가기" />
        </View>
      ) : profile === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          data={posts}
          keyExtractor={(item) => item.feed_item_id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.messageText}>
                {profile.is_me
                  ? '아직 쓴 글이 없어요. 첫 글을 올려 보세요!'
                  : '아직 쓴 글이 없어요.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null
          }
          ListHeaderComponent={header}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => {
                setRefreshing(true);
                void load(false);
              }}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <CommunityPostCard
              onAuthorPress={openProfile}
              onLike={() => void actions.toggleLike(item)}
              onMore={() => actions.openPostMenu(item)}
              onPress={() =>
                router.push({ params: { postId: item.post_id }, pathname: '/community/[postId]' })
              }
              onRepost={() => void actions.toggleRepost(item)}
              post={item}
            />
          )}
        />
      )}
      {actions.elements}
    </View>
  );
}

function MyRow({ label, onPress, value }: { label: string; onPress: () => void; value: string }) {
  return (
    <Pressable
      accessibilityLabel={`${label} ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.myRow, pressed && styles.myRowPressed]}
    >
      <Text style={styles.myRowLabel}>{label}</Text>
      <Text style={styles.myRowValue}>{value} ›</Text>
    </Pressable>
  );
}

function Stat({ label, onPress, value }: { label: string; onPress?: () => void; value: number }) {
  return (
    <Pressable
      accessibilityLabel={`${label} ${value}명`}
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={styles.stat}
    >
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  profile: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  profileTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 56, paddingVertical: spacing.xs },
  statValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18 },
  statLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
  },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  name: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
  },
  badge: {
    backgroundColor: colors.background,
    borderRadius: 6,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxl },
  footer: { paddingVertical: spacing.lg },
  myRows: { backgroundColor: colors.background, borderRadius: 12, overflow: 'hidden' },
  myRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  myRowPressed: { backgroundColor: colors.border },
  myRowLabel: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
  },
  myRowValue: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
  },
});
