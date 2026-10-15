import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import PencilIcon from '@/assets/icons/feature/Pencil_Fill.svg';
import {
  getCommunityClub,
  getCommunityClubPosts,
  getCommunityErrorMessage,
  setCommunityClubMembership,
  type CommunityAuthor,
  type CommunityClub,
  type CommunityPost,
} from '@/src/api/community';
import { AppButton, AppHeader } from '@/src/components/common';
import { CommunityPostCard, communityClubCategoryLabel } from '@/src/components/community';
import {
  applyCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, shadows, spacing, typography } from '@/src/theme';

export default function CommunityClubScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { handleError, notify } = actions;
  const [club, setClub] = useState<CommunityClub | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadingMoreRef = useRef(false);

  const load = useCallback(
    async (inlineError: boolean) => {
      try {
        const [nextClub, page] = await Promise.all([
          getCommunityClub(clubId),
          getCommunityClubPosts(clubId),
        ]);
        setClub(nextClub);
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
    [clubId, notify],
  );

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  useEffect(
    () =>
      subscribeCommunityEvents((event) => {
        if (event.type === 'clubPostCreated' && event.clubId === clubId) {
          setPosts((current) => [event.post, ...current]);
          setClub((current) => current && { ...current, post_count: current.post_count + 1 });
          return;
        }
        setPosts((current) => applyCommunityEvent(current, event));
      }),
    [clubId],
  );

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await getCommunityClubPosts(clubId, cursor);
      setPosts((current) => {
        const seen = new Set(current.map((item) => item.feed_item_id));
        return [...current, ...page.items.filter((item) => !seen.has(item.feed_item_id))];
      });
      setCursor(page.next_cursor);
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const toggleMembership = async () => {
    if (!club || busy) return;
    const joining = !club.is_member;
    setBusy(true);
    try {
      const result = await setCommunityClubMembership(club.club_id, joining);
      setClub({ ...club, is_member: result.joined, member_count: result.member_count });
      notify(joining ? `${club.name}에 가입했어요.` : `${club.name}에서 나왔어요.`);
    } catch (error) {
      handleError(error, undefined, () => void toggleMembership());
    } finally {
      setBusy(false);
    }
  };

  const openProfile = (author: CommunityAuthor) =>
    router.push({ params: { userId: author.user_id }, pathname: '/community/user/[userId]' });

  const header = club ? (
    <View style={styles.info}>
      <Text style={styles.category}>{communityClubCategoryLabel(club.category)}</Text>
      <Text style={styles.name}>{club.name}</Text>
      {club.description ? <Text style={styles.description}>{club.description}</Text> : null}
      <Text style={styles.meta}>
        회원 {club.member_count.toLocaleString()}명 · 글 {club.post_count.toLocaleString()}개 ·
        클럽장 {club.owner.nickname}
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          router.push({
            params: { clubId: club.club_id, clubName: club.name, scope: 'club' },
            pathname: '/community/ranking',
          })
        }
      >
        <Text style={styles.rankingLink}>이번 주 클럽 랭킹 보기 ›</Text>
      </Pressable>
      {club.is_owner ? (
        <Text style={styles.ownerNote}>내가 만든 클럽이에요.</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void toggleMembership()}
          style={({ pressed }) => [
            styles.joinButton,
            club.is_member ? styles.joined : styles.join,
            (pressed || busy) && styles.pressed,
          ]}
        >
          <Text style={[styles.joinText, club.is_member ? styles.joinedText : styles.joinTextOn]}>
            {club.is_member ? '클럽 나가기' : '클럽 가입하기'}
          </Text>
        </Pressable>
      )}
    </View>
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title={club?.name ?? '클럽'} />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => router.back()} title="돌아가기" />
        </View>
      ) : club === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          data={posts}
          keyExtractor={(item) => item.feed_item_id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.messageText}>
                {club.is_member
                  ? '아직 글이 없어요. 첫 글을 남겨 보세요!'
                  : '아직 글이 없어요. 가입하면 글을 쓸 수 있어요.'}
              </Text>
            </View>
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
      {club?.is_member ? (
        <Pressable
          accessibilityLabel="클럽에 글쓰기"
          accessibilityRole="button"
          onPress={() =>
            router.push({
              params: { clubId: club.club_id, clubName: club.name },
              pathname: '/community/compose',
            })
          }
          style={({ pressed }) => [
            styles.compose,
            shadows.floating,
            { bottom: insets.bottom + spacing.xl },
            pressed && styles.composePressed,
          ]}
        >
          <PencilIcon color={colors.surface} height={26} width={26} />
        </Pressable>
      ) : null}
      {actions.elements}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  info: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  category: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  name: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 20 },
  description: { ...typography.body, color: colors.textBody },
  meta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 13 },
  rankingLink: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    marginTop: 2,
  },
  ownerNote: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  joinButton: {
    alignItems: 'center',
    borderRadius: radius.round,
    borderWidth: 1,
    marginTop: spacing.sm,
    minHeight: 42,
    justifyContent: 'center',
  },
  join: { backgroundColor: colors.primary, borderColor: colors.primary },
  joined: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { opacity: 0.75 },
  joinText: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
  joinTextOn: { color: colors.surface },
  joinedText: { color: colors.textPrimary },
  message: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxl },
  compose: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xl,
    width: 56,
  },
  composePressed: { backgroundColor: colors.primaryDark },
});
