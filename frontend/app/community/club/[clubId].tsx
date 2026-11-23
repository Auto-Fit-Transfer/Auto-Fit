import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaretText } from '@/src/components/common/CaretText';
import MoreIcon from '@/assets/icons/system/DotsThree.svg';
import {
  deleteCommunityClub,
  getCommunityClub,
  getCommunityClubPosts,
  getCommunityErrorMessage,
  setCommunityClubMembership,
  type CommunityAuthor,
  type CommunityClub,
  type CommunityPost,
} from '@/src/api/community';
import { AppButton, AppHeader, IconButton, Text } from '@/src/components/common';
import { CommunityAvatar, CommunityPostCard, communityClubCategoryLabel } from '@/src/components/community';
import {
  applyCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { COMMUNITY_RANKING_ENABLED } from '@/src/features/community/communityFeatures';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';

export default function CommunityClubScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
    if (!joining) {
      actions.askConfirm({
        confirmText: '나가기',
        description: `${club.name} 클럽에서 나갈까요? 다시 가입할 수 있어요.`,
        run: async () => {
          setBusy(true);
          try {
            const result = await setCommunityClubMembership(club.club_id, false);
            setClub((current) => current && { ...current, is_member: result.joined, member_count: result.member_count });
            notify(`${club.name}에서 나왔어요.`);
          } finally {
            setBusy(false);
          }
        },
        title: '클럽에서 나갈까요?',
      });
      return;
    }
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

  // After editing on another screen, show the new name and intro.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      getCommunityClub(clubId).then(setClub, () => undefined);
    }, [clubId]),
  );

  const openOwnerMenu = () => {
    if (!club) return;
    actions.openSheet([
      {
        label: '클럽 수정',
        onPress: () =>
          router.push({ params: { clubId: club.club_id }, pathname: '/community/club/new' }),
      },
      {
        destructive: true,
        label: '클럽 삭제',
        onPress: () =>
          actions.askConfirm({
            confirmText: '삭제',
            description: `클럽 글 ${club.post_count.toLocaleString()}개와 사진·댓글·좋아요가 모두 지워지고 되돌릴 수 없어요.`,
            run: async () => {
              await deleteCommunityClub(club.club_id);
              notify('클럽을 삭제했어요.');
              router.back();
            },
            title: `${club.name} 클럽을 삭제할까요?`,
          }),
      },
    ]);
  };

  const openMembers = () =>
    club &&
    router.push({
      params: { clubId: club.club_id, clubName: club.name, owner: club.is_owner ? '1' : '0' },
      pathname: '/community/club/members',
    });

  const openProfile = (author: CommunityAuthor) =>
    router.push({ params: { userId: author.user_id }, pathname: '/community/user/[userId]' });

  const header = club ? (
    <View style={styles.info}>
      <View style={styles.identity}>
        <View style={styles.categoryIcon}><Text style={styles.categoryIconText}>{communityClubCategoryLabel(club.category).slice(0, 2)}</Text></View>
        <View style={styles.identityText}>
          <Text style={styles.category}>{communityClubCategoryLabel(club.category)}</Text>
          <Text style={styles.name}>{club.name}</Text>
          <Text style={styles.meta}>회원 {club.member_count.toLocaleString()}명 · 글 {club.post_count.toLocaleString()}개</Text>
        </View>
      </View>
      {club.description ? <Text style={styles.description}>{club.description}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => openProfile(club.owner)} style={styles.ownerRow}>
        <CommunityAvatar author={club.owner} size={24} />
        <Text style={styles.ownerLabel}>클럽장</Text>
        <Text style={styles.ownerName}>{club.owner.nickname}</Text>
      </Pressable>
      <View style={styles.actionRow}>
        {club.is_owner ? (
          <View style={[styles.joinButton, styles.joined, styles.action]}><Text style={styles.joinedText}>내가 만든 클럽</Text></View>
        ) : (
          <Pressable
            accessibilityLabel={club.is_member ? '클럽 나가기' : '클럽 가입하기'}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void toggleMembership()}
            style={({ pressed }) => [styles.joinButton, styles.action, club.is_member ? styles.joined : styles.join, (pressed || busy) && styles.pressed]}
          >
            <Text style={club.is_member ? styles.joinedText : styles.joinTextOn}>{club.is_member ? '가입함' : '클럽 가입하기'}</Text>
          </Pressable>
        )}
        {club.is_member || club.is_owner ? <Pressable accessibilityRole="button" onPress={() => router.push({ params: { clubId: club.club_id, clubName: club.name }, pathname: '/community/compose' })} style={[styles.joinButton, styles.action, styles.join]}><Text style={styles.joinTextOn}>클럽에 글쓰기</Text></Pressable> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={openMembers} style={styles.membersCard}>
        <Text style={styles.membersCount}>회원 {club.member_count.toLocaleString()}명</Text>
        <View style={styles.membersMore}><Text style={styles.membersLink}>전체 보기</Text><CaretRightIcon color={colors.textSecondary} height={18} width={18} /></View>
      </Pressable>
      {COMMUNITY_RANKING_ENABLED ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              params: { clubId: club.club_id, clubName: club.name, scope: 'club' },
              pathname: '/community/ranking',
            })
          }
        >
          <CaretText style={styles.rankingLink}>이번 주 클럽 랭킹 보기</CaretText>
        </Pressable>
      ) : null}
      <View style={styles.feedHeading}><Text style={styles.feedTitle}>클럽 글 {club.post_count.toLocaleString()}</Text><Text style={styles.sortLabel}>최신순</Text></View>
    </View>
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader
        onBackPress={() => router.back()}
        rightAction={
          club?.is_owner ? (
            <IconButton
              accessibilityLabel="클럽 관리"
              icon={<MoreIcon color={colors.textBody} height={22} width={22} />}
              onPress={openOwnerMenu}
              size={44}
            />
          ) : null
        }
        title="클럽"
      />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => router.back()} title="돌아가기" />
        </View>
      ) : club === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
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
            <View style={styles.postWrap}><CommunityPostCard
              onAuthorPress={openProfile}
              onLike={() => void actions.toggleLike(item)}
              onMore={() => actions.openPostMenu(item)}
              onPress={() =>
                router.push({ params: { postId: item.post_id }, pathname: '/community/[postId]' })
              }
              onRepost={() => void actions.toggleRepost(item)}
              post={item}
            /></View>
          )}
        />
      )}
      {actions.elements}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  // Renewal B (b-community.html #vClub): the club's name as a big bold title, its words roomy, the join
  // pill black (grey once in), the members as one white pill row, then its posts.
  const a = aForm(colors);
  const button = { alignItems: 'center', borderRadius: 999, height: 50, justifyContent: 'center' } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    info: { gap: 14, paddingBottom: 8, paddingHorizontal: 20, paddingTop: 8 },
    identity: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    categoryIcon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 14, height: 52, justifyContent: 'center', width: 52 },
    categoryIconText: { ...a.p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold },
    identityText: { flex: 1, gap: 2 },
    category: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    name: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 26, letterSpacing: -0.5, lineHeight: 34 },
    description: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 23 },
    meta: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    ownerRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    ownerLabel: a.note,
    ownerName: { ...a.p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    actionRow: { flexDirection: 'row', gap: 8 },
    action: { flex: 1 },
    membersCard: { ...a.card, alignItems: 'center', borderRadius: 999, flexDirection: 'row', justifyContent: 'space-between', minHeight: 60, paddingLeft: 22, paddingRight: 16 },
    membersMore: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    membersCount: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    membersLink: a.note,
    feedHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 },
    feedTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    sortLabel: a.note,
    rankingLink: { ...a.p12, color: colors.textPrimary, textDecorationLine: 'underline' },
    joinButton: { ...button, backgroundColor: colors.surface, },
    join: { backgroundColor: colors.primary, },
    // Already in: flat and grey, it is no longer the thing to press first.
    joined: { backgroundColor: colors.surfaceMuted, },
    pressed: { opacity: 0.85 },
    joinTextOn: { ...a.goText, fontSize: 15 },
    joinedText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    message: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    empty: { alignItems: 'center', padding: 32 },
    postWrap: { marginHorizontal: 20, marginTop: 14 },
  } as const;
}
