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
import { ApiError } from '@/src/api/client';

import PencilIcon from '@/assets/icons/feature/Pencil_Fill.svg';
import UserIcon from '@/assets/icons/input/User.svg';
import BellIcon from '@/assets/icons/system/Bell.svg';
import SearchIcon from '@/assets/icons/input/MagnifyingGlass.svg';
import GearIcon from '@/assets/icons/system/GearSix.svg';
import {
  getCommunityErrorMessage,
  getCommunityFeed,
  getCommunityUnreadCount,
  type CommunityAuthor,
  type CommunityFeedScope,
  type CommunityPost,
  type CommunityPostCategory,
} from '@/src/api/community';
import { IconButton } from '@/src/components/common';
import { R6ConnectionError } from '@/src/components/common/R6ConnectionError';
import { CommunityPostCard } from '@/src/components/community';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
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
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, darkColors, fontFamilies, radius, shadows, spacing, typography } from '@/src/theme';

type LoadState = 'loading' | 'ready' | 'error';

type Tab = CommunityFeedScope | 'clubs' | 'challenges';

const TABS: { label: string; value: Tab }[] = [
  { label: '추천', value: 'all' },
  { label: '팔로잉', value: 'following' },
  { label: '클럽', value: 'clubs' },
];
const CATEGORIES: { label: string; value: CommunityPostCategory | null }[] = [
  { label: '전체', value: null }, { label: '운동 기록', value: 'workout' },
  { label: '루틴 공유', value: 'routine' }, { label: '식단', value: 'diet' },
  { label: '질문', value: 'question' }, { label: '후기', value: 'review' },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const { height: windowHeight } = useWindowDimensions();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [scope, setScope] = useState<CommunityFeedScope>('all');
  const [activeCategory, setActiveCategory] = useState<CommunityPostCategory | null>(null);
  // Clubs and challenges replace the feed list; the feed keeps its scope underneath.
  const [pane, setPane] = useState<'clubs' | 'challenges' | null>(null);
  const activeTab: Tab = pane ?? scope;
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorOffline, setErrorOffline] = useState(false);
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
        const page = await getCommunityFeed(null, scope, scope === 'all' ? activeCategory : null);
        if (id !== request.current) return;
        setItems(page.items);
        setCursor(page.next_cursor);
        setState('ready');
      } catch (error) {
        if (id !== request.current) return;
        if (inlineError) {
          setErrorMessage(getCommunityErrorMessage(error));
          setErrorOffline(error instanceof ApiError && error.status === 0);
          setState('error');
        } else {
          notify(getCommunityErrorMessage(error));
        }
      } finally {
        setRefreshing(false);
      }
    },
    [activeCategory, notify, scope],
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
      const page = await getCommunityFeed(cursor, scope, scope === 'all' ? activeCategory : null);
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
  }, [activeCategory, cursor, notify, scope]);

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
    setPane(next === 'clubs' || next === 'challenges' ? next : null);
    if (next === 'clubs' || next === 'challenges' || next === scope) return;
    setItems([]);
    setCursor(null);
    setState('loading');
    setScope(next);
  };

  const switchCategory = (category: CommunityPostCategory | null) => {
    if (activeCategory === category) return;
    request.current += 1;
    setItems([]);
    setCursor(null);
    setState('loading');
    setActiveCategory(category);
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
    <View style={[styles.root, isDark && dark.root]}>
      <View style={[styles.header, isDark && dark.card, { paddingTop: insets.top + spacing.sm }]}>
        <Text accessibilityRole="header" style={[styles.title, simple && simpleStyles.title, isDark && dark.text]}>
          커뮤니티
        </Text>
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="커뮤니티 검색"
            icon={<SearchIcon color={colors.textBody} height={24} width={24} />}
            onPress={() => router.push('/community/search')}
            size={44}
          />
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
      {simple ? <View style={[simpleStyles.readRow, isDark && dark.card]}><Text style={[simpleStyles.readHint, isDark && dark.secondary]}>추천 글과 클럽을 둘러보세요</Text><SimpleReadButton text={`커뮤니티입니다. ${activeTab === 'clubs' ? '클럽' : activeTab === 'following' ? '팔로잉' : '추천'} 탭을 보고 있어요. ${items.length}개의 글이 있습니다.`} /></View> : null}
      <View accessibilityRole="tablist" style={[styles.tabs, isDark && dark.card]}>
        {TABS.map((item) => (
          <Pressable
            accessibilityRole="tab"
            aria-selected={item.value === activeTab}
            key={item.value}
            onPress={() => switchTab(item.value)}
            style={[styles.tab, simple && simpleStyles.tab, item.value === activeTab && styles.tabActive]}
          >
            <Text style={[styles.tabText, simple && simpleStyles.tabText, item.value === activeTab && styles.tabTextActive, isDark && dark.text]}>
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
        <R6ConnectionError message={errorMessage} offline={errorOffline} onRetry={retry} />
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: bottomSpace + 96 }]}
          data={items}
          keyExtractor={(item) => item.feed_item_id}
          ListHeaderComponent={
            scope === 'all' ? (
              <View style={[styles.feedHeader, isDark && dark.card]}>
                <View style={styles.categories}>
                  {CATEGORIES.map((category) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: activeCategory === category.value }}
                      onPress={() => switchCategory(category.value)}
                      key={category.label}
                      style={[styles.categoryChip, simple && simpleStyles.categoryChip, activeCategory === category.value && styles.categoryActive]}
                    >
                      <Text style={[styles.categoryText, simple && simpleStyles.categoryText, activeCategory === category.value && styles.categoryTextActive]}>{category.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable accessibilityRole="button" onPress={() => setPane('challenges')} style={[styles.challengeCard, simple && simpleStyles.challengeCard, isDark && dark.card]}>
                  <View style={styles.challengeIcon}><Text style={styles.challengeIconText}>♧</Text></View>
                  <View style={styles.challengeCopy}>
                    <Text style={[styles.challengeTitle, simple && simpleStyles.challengeTitle, isDark && dark.text]}>커뮤니티 챌린지</Text>
                    <Text style={styles.challengeDescription}>함께 운동하며 목표에 도전해 보세요</Text>
                  </View>
                  <Text style={styles.challengeAction}>보기 ›</Text>
                </Pressable>
              </View>
            ) : null
          }
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
                <Text style={styles.emptyTitle}>{activeCategory ? '이 분류에 올라온 글이 없어요' : '아직 올라온 글이 없어요'}</Text>
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
            <View style={[styles.postWrap, isDark && dark.card]}><CommunityPostCard
              onAuthorPress={openProfile}
              onLike={() => void actions.toggleLike(item)}
              onMore={() => actions.openPostMenu(item)}
              onPress={() => openPost(item)}
              onRepost={() => void actions.toggleRepost(item)}
              post={item}
            /></View>
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
  root: { backgroundColor: '#F8F8FA', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
  },
  title: { ...typography.title, color: '#222127' },
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
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E6E6EB',
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
  tabActive: { borderBottomColor: '#503DD7' },
  tabText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  tabTextActive: { color: '#222127', fontFamily: fontFamilies.pretendardBold },
  list: { flexGrow: 1, gap: 10 },
  feedHeader: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 16 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChip: { borderColor: '#E6E6EB', borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 },
  categoryActive: { backgroundColor: '#503DD7', borderColor: '#503DD7' },
  categoryText: { color: '#666670', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  categoryTextActive: { color: '#FFFFFF' },
  categoryNotice: { color: '#9998A1', fontSize: 10 },
  challengeCard: { borderColor: '#E6E6EB', borderWidth: 1, borderRadius: 12, backgroundColor: '#FAFAFC', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  challengeIcon: { backgroundColor: '#F1EFFF', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  challengeIconText: { color: '#503DD7', fontSize: 18 },
  challengeCopy: { flex: 1, gap: 2 },
  challengeTitle: { color: '#25242B', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  challengeDescription: { color: '#8A8992', fontSize: 10 },
  challengeAction: { color: '#503DD7', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 11 },
  postWrap: { backgroundColor: '#FFFFFF', borderColor: '#E6E6EB', borderTopWidth: 1, borderBottomWidth: 1 },
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

const simpleStyles = StyleSheet.create({
  title: { fontSize: 26 },
  readRow: { alignItems: 'center', backgroundColor: '#FFFFFF', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  readHint: { color: '#777781', flex: 1, fontSize: 13 },
  tab: { minHeight: 52 },
  tabText: { fontSize: 17 },
  categoryChip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  categoryText: { fontSize: 14 },
  challengeCard: { minHeight: 82, padding: 16 },
  challengeTitle: { fontSize: 17 },
});

const dark = StyleSheet.create({
  root: { backgroundColor: darkColors.background },
  card: { backgroundColor: darkColors.surface, borderColor: darkColors.border },
  text: { color: darkColors.textPrimary },
  secondary: { color: darkColors.textSecondary },
});
