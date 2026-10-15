import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PencilIcon from '@/assets/icons/feature/Pencil_Fill.svg';
import UserIcon from '@/assets/icons/input/User.svg';
import BellIcon from '@/assets/icons/system/Bell.svg';
import GearIcon from '@/assets/icons/system/GearSix.svg';
import {
  getCommunityErrorMessage,
  getCommunityFeed,
  getCommunityUnreadCount,
  type CommunityAuthor,
  type CommunityFeedScope,
  type CommunityPost,
} from '@/src/api/community';
import { AppButton, IconButton } from '@/src/components/common';
import { CommunityPostCard } from '@/src/components/community';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from '@/src/components/navigation/BottomNavigation';
import {
  applyCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { CommunityClubsPane } from '@/src/features/community/CommunityClubsPane';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, shadows, spacing, typography } from '@/src/theme';

type LoadState = 'loading' | 'ready' | 'error';

type Tab = CommunityFeedScope | 'clubs';

const TABS: { label: string; value: Tab }[] = [
  { label: '전체', value: 'all' },
  { label: '팔로잉', value: 'following' },
  { label: '클럽', value: 'clubs' },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [scope, setScope] = useState<CommunityFeedScope>('all');
  const [showClubs, setShowClubs] = useState(false);
  const activeTab: Tab = showClubs ? 'clubs' : scope;
  const [unread, setUnread] = useState(0);
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
    }, []),
  );

  const switchTab = (next: Tab) => {
    setShowClubs(next === 'clubs');
    if (next === 'clubs' || next === scope) return;
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
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text accessibilityRole="header" style={styles.title}>
          커뮤니티
        </Text>
        <View style={styles.headerActions}>
          <View>
            <IconButton
              accessibilityLabel={unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : '알림'}
              icon={<BellIcon color={colors.textBody} height={24} width={24} />}
              onPress={() => router.push('/community/notifications')}
              size={44}
            />
            {unread > 0 ? (
              <View pointerEvents="none" style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </View>
          <IconButton
            accessibilityLabel="내 프로필"
            icon={<UserIcon color={colors.textBody} height={24} width={24} />}
            onPress={() =>
              router.push({ params: { userId: 'me' }, pathname: '/community/user/[userId]' })
            }
            size={44}
          />
          <IconButton
            accessibilityLabel="차단한 사용자 관리"
            icon={<GearIcon color={colors.textBody} height={24} width={24} />}
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

      {showClubs ? (
        <CommunityClubsPane bottomSpace={bottomSpace} />
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

      {showClubs ? null : (
        <Pressable
          accessibilityLabel="글쓰기"
          accessibilityRole="button"
          onPress={() => router.push('/community/compose')}
          style={({ pressed }) => [
            styles.compose,
            shadows.floating,
            { bottom: bottomSpace + spacing.lg },
            pressed && styles.composePressed,
          ]}
        >
          <PencilIcon color={colors.surface} height={26} width={26} />
        </Pressable>
      )}
      {actions.elements}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary },
  headerActions: { flexDirection: 'row' },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.round,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 4,
    top: 4,
  },
  badgeText: { color: colors.surface, fontFamily: fontFamilies.pretendardBold, fontSize: 11 },
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
  list: { flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center' },
  message: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 17,
  },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  footer: { paddingVertical: spacing.lg },
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
