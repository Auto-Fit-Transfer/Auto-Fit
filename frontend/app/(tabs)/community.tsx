import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatIcon from '@/assets/icons/feature/ChatTeardropDots_Fill.svg';
import PencilIcon from '@/assets/icons/feature/Pencil_Fill.svg';
import GearIcon from '@/assets/icons/system/GearSix.svg';
import BellIcon from '@/assets/icons/ui/bell.svg';
import UserIcon from '@/assets/icons/ui/user.svg';
import {
  getCommunityErrorMessage,
  getCommunityFeed,
  getCommunityUnreadCount,
  getCommunityUnreadMessages,
  type CommunityAuthor,
  type CommunityFeedScope,
  type CommunityPost,
} from '@/src/api/community';
import { AppButton, IconButton, Text } from '@/src/components/common';
import { CommunityPostCard } from '@/src/components/community';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from '@/src/components/navigation/BottomNavigation';
import {
  applyCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { CommunityChallengesPane } from '@/src/features/community/CommunityChallengesPane';
import { CommunityClubsPane } from '@/src/features/community/CommunityClubsPane';
import { COMMUNITY_MESSAGES_ENABLED } from '@/src/features/community/communityFeatures';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type LoadState = 'loading' | 'ready' | 'error';

type Tab = CommunityFeedScope | 'clubs' | 'challenges';

const TABS: { label: string; value: Tab }[] = [
  { label: '전체', value: 'all' },
  { label: '팔로잉', value: 'following' },
  { label: '클럽', value: 'clubs' },
  { label: '챌린지', value: 'challenges' },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const actions = useCommunityActions();
  const { notify } = actions;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [scope, setScope] = useState<CommunityFeedScope>('all');
  // Clubs and challenges replace the feed list; the feed keeps its scope underneath.
  const [pane, setPane] = useState<'clubs' | 'challenges' | null>(null);
  const activeTab: Tab = pane ?? scope;
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  // Ignores answers for a tab the user already left.
  const request = useRef(0);
  const bottomSpace =
    getBottomNavigationVisualHeight(windowHeight) +
    Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP);

  // The effect only starts the request; state changes happen after it answers.
  const loadFirstPage = useCallback(
    async (inlineError: boolean) => {
      const id = ++request.current;
      try {
        const page = await getCommunityFeed(null, scope);
        if (id !== request.current) return;
        setItems(page.items);
        setCursor(page.next_cursor);
        setState('ready');
      } catch (error) {
        if (id !== request.current) return;
        if (inlineError) {
          setErrorMessage(getCommunityErrorMessage(error));
          setState('error');
        } else {
          notify(getCommunityErrorMessage(error));
        }
      } finally {
        setRefreshing(false);
      }
    },
    [notify, scope],
  );

  const refresh = () => {
    setRefreshing(true);
    void loadFirstPage(false);
  };

  const retry = () => {
    setState('loading');
    void loadFirstPage(true);
  };

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const id = request.current;
    try {
      const page = await getCommunityFeed(cursor, scope);
      if (id !== request.current) return;
      setItems((current) => {
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
  }, [cursor, notify, scope]);

  // The badge refreshes whenever the tab comes back into view (e.g. after reading them).
  useFocusEffect(
    useCallback(() => {
      getCommunityUnreadCount().then(
        (result) => setUnread(result.unread_count),
        () => undefined,
      );
      if (COMMUNITY_MESSAGES_ENABLED) {
        getCommunityUnreadMessages().then(
          (result) => setUnreadMessages(result.unread_count),
          () => undefined,
        );
      }
    }, []),
  );

  const switchTab = (next: Tab) => {
    setPane(next === 'clubs' || next === 'challenges' ? next : null);
    if (next === 'clubs' || next === 'challenges' || next === scope) return;
    setItems([]);
    setCursor(null);
    setState('loading');
    setScope(next);
  };

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void loadFirstPage(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadFirstPage]);

  useEffect(
    () =>
      subscribeCommunityEvents((event) =>
        setItems((current) => applyCommunityEvent(current, event)),
      ),
    [],
  );

  const openPost = (post: CommunityPost) =>
    router.push({ params: { postId: post.post_id }, pathname: '/community/[postId]' });

  const openProfile = (author: CommunityAuthor) =>
    router.push({ params: { userId: author.user_id }, pathname: '/community/user/[userId]' });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text accessibilityRole="header" style={styles.title}>
          커뮤니티
        </Text>
        <View style={styles.headerActions}>
          <View>
            <IconButton
              accessibilityLabel={unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : '알림'}
              icon={<BellIcon color={colors.textPrimary} height={24} width={24} />}
              onPress={() => router.push('/community/notifications')}
              size={44}
            />
            {unread > 0 ? (
              <View pointerEvents="none" style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </View>
          {COMMUNITY_MESSAGES_ENABLED ? (
            <View>
              <IconButton
                accessibilityLabel={
                  unreadMessages > 0 ? `메시지, 안 읽은 메시지 ${unreadMessages}개` : '메시지'
                }
                icon={<ChatIcon color={colors.textPrimary} height={24} width={24} />}
                onPress={() => router.push('/community/messages')}
                size={44}
              />
              {unreadMessages > 0 ? (
                <View pointerEvents="none" style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <IconButton
            accessibilityLabel="내 프로필"
            icon={<UserIcon color={colors.textPrimary} height={24} width={24} />}
            onPress={() =>
              router.push({ params: { userId: 'me' }, pathname: '/community/user/[userId]' })
            }
            size={44}
          />
          <IconButton
            accessibilityLabel="차단한 사용자 관리"
            icon={<GearIcon color={colors.textPrimary} height={24} width={24} />}
            onPress={() => router.push('/community/blocks')}
            size={44}
          />
        </View>
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable
            accessibilityRole="tab"
            aria-selected={item.value === activeTab}
            key={item.value}
            onPress={() => switchTab(item.value)}
            style={[styles.tab, item.value === activeTab && styles.tabActive]}
          >
            <Text style={[styles.tabText, item.value === activeTab && styles.tabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {pane === 'clubs' ? (
        <CommunityClubsPane bottomSpace={bottomSpace} />
      ) : pane === 'challenges' ? (
        <CommunityChallengesPane bottomSpace={bottomSpace} />
      ) : state === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.center} />
      ) : state === 'error' ? (
        <View style={[styles.center, styles.message]}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={retry} title="다시 시도" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: bottomSpace + 96 }]}
          data={items}
          keyExtractor={(item) => item.feed_item_id}
          ListEmptyComponent={
            scope === 'following' ? (
              <View style={[styles.center, styles.message]}>
                <Text style={styles.emptyTitle}>팔로우한 사람의 글이 여기에 보여요</Text>
                <Text style={styles.messageText}>
                  전체 피드에서 닉네임을 눌러 마음에 드는 사람을 팔로우해 보세요.
                </Text>
              </View>
            ) : (
              <View style={[styles.center, styles.message]}>
                <Text style={styles.emptyTitle}>아직 올라온 글이 없어요</Text>
                <Text style={styles.messageText}>오늘의 운동이나 식단을 처음으로 나눠 보세요!</Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <CommunityPostCard
              onAuthorPress={openProfile}
              onLike={() => void actions.toggleLike(item)}
              onMore={() => actions.openPostMenu(item)}
              onPress={() => openPost(item)}
              onRepost={() => void actions.toggleRepost(item)}
              post={item}
            />
          )}
        />
      )}

      {pane ? null : (
        <Pressable
          accessibilityLabel="글쓰기"
          accessibilityRole="button"
          onPress={() => router.push('/community/compose')}
          style={({ pressed }) => [
            styles.compose,
            { bottom: bottomSpace + 16 },
            pressed && styles.composePressed,
          ]}
        >
          <PencilIcon color={colors.onPrimary} height={18} width={18} />
          <Text style={styles.composeText}>글쓰기</Text>
        </Pressable>
      )}
      {actions.elements}
    </View>
  );
}

// Figma F1: title row, underline tabs, full-width posts, and a "글쓰기" pill button.
function createStyles({ colors, text }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingLeft: 20,
      paddingRight: 8,
    },
    title: { ...text.title1, color: colors.textPrimary },
    headerActions: { flexDirection: 'row' },
    badge: {
      alignItems: 'center',
      backgroundColor: colors.danger,
      borderColor: colors.background,
      borderRadius: radius.round,
      borderWidth: 1.5,
      minWidth: 18,
      paddingHorizontal: 4,
      position: 'absolute',
      right: 4,
      top: 4,
    },
    badgeText: { ...text.captionStrong, color: colors.onPrimary, fontSize: 11, lineHeight: 15 },
    tabs: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 22,
      paddingHorizontal: 20,
    },
    tab: {
      borderBottomColor: 'transparent',
      borderBottomWidth: 2,
      marginBottom: -1,
      paddingVertical: 10,
    },
    tabActive: { borderBottomColor: colors.textPrimary },
    tabText: { ...text.body1, color: colors.textSecondary },
    tabTextActive: { ...text.body1Strong, color: colors.textPrimary },
    list: { flexGrow: 1 },
    center: { flex: 1, justifyContent: 'center' },
    message: { alignItems: 'center', gap: 12, padding: 24 },
    emptyTitle: { ...text.body1Strong, color: colors.textPrimary },
    messageText: { ...text.body2, color: colors.textSecondary, textAlign: 'center' },
    footer: { paddingVertical: 16 },
    compose: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.round,
      elevation: 6,
      flexDirection: 'row',
      gap: 6,
      paddingLeft: 16,
      paddingRight: 20,
      paddingVertical: 13,
      position: 'absolute',
      right: 20,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
    },
    composePressed: { backgroundColor: colors.primaryPressed },
    composeText: { ...text.body2Strong, color: colors.onPrimary },
  } as const;
}
