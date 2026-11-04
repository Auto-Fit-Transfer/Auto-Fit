import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/src/api/client';

import TrophyIcon from '@/assets/icons/deco/Trophy.svg';
import BellIcon from '@/assets/icons/ui/bell.svg';
import SearchIcon from '@/assets/icons/ui/magnifying-glass.svg';
import PencilIcon from '@/assets/icons/ui/pencil-simple.svg';
import {
  getCommunityChallenges,
  getCommunityErrorMessage,
  getCommunityFeed,
  getCommunityUnreadCount,
  type CommunityAuthor,
  type CommunityChallenge,
  type CommunityFeedScope,
  type CommunityPost,
  type CommunityPostCategory,
} from '@/src/api/community';
import { IconButton, Text } from '@/src/components/common';
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
import { colors, darkColors, fontFamilies, shadows, spacing, typography } from '@/src/theme';

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

function challengeSummary(challenge: CommunityChallenge) {
  const unit = challenge.metric === 'workout_days' ? '회' : '일';
  const end = new Date(`${challenge.ends_on}T23:59:59`).getTime();
  const left = Math.ceil((end - Date.now()) / 86400000) - 1;
  return [
    challenge.joined ? `나 ${challenge.progress}/${challenge.goal}${unit}` : `목표 ${challenge.goal}${unit}`,
    left <= 0 ? '오늘 마감' : `${left}일 남음`,
    `${challenge.participant_count.toLocaleString()}명 참여`,
  ].join(' · ');
}

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
  const [challenge, setChallenge] = useState<CommunityChallenge | null>(null);
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
      getCommunityChallenges().then(
        (list) => {
          const ongoing = list.filter((item) => item.phase === 'ongoing');
          setChallenge(ongoing.find((item) => item.joined) ?? ongoing[0] ?? null);
        },
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
            icon={<SearchIcon color={isDark ? darkColors.textPrimary : '#17161D'} height={24} width={24} />}
            onPress={() => router.push('/community/search')}
            size={44}
          />
          <View>
            <IconButton
              accessibilityLabel={unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : '알림'}
              icon={<BellIcon color={isDark ? darkColors.textPrimary : '#17161D'} height={24} width={24} />}
              onPress={() => router.push('/community/notifications')}
              size={44}
            />
            {unread > 0 ? <View pointerEvents="none" style={styles.badge} /> : null}
          </View>
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
                <ScrollView contentContainerStyle={styles.categories} horizontal showsHorizontalScrollIndicator={false}>
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
                </ScrollView>
                <Pressable accessibilityRole="button" onPress={() => setPane('challenges')} style={[styles.challengeCard, simple && simpleStyles.challengeCard, isDark && dark.card]}>
                  <View style={[styles.challengeIcon, isDark && dark.card]}><TrophyIcon color={isDark ? darkColors.textPrimary : '#17161D'} height={22} width={22} /></View>
                  <View style={styles.challengeCopy}>
                    <Text style={[styles.challengeTitle, simple && simpleStyles.challengeTitle, isDark && dark.text]}>{challenge?.title ?? '커뮤니티 챌린지'}</Text>
                    {challenge && challenge.goal <= 7 ? (
                      <View style={styles.challengeBars}>
                        {Array.from({ length: challenge.goal }, (_, index) => (
                          <View key={index} style={[styles.challengeBar, index < challenge.progress && challenge.joined && styles.challengeBarDone]} />
                        ))}
                      </View>
                    ) : null}
                    <Text style={[styles.challengeDescription, isDark && dark.secondary]}>{challenge ? challengeSummary(challenge) : '함께 운동하며 목표에 도전해 보세요'}</Text>
                  </View>
                  <View style={[styles.challengeAction, isDark && dark.card]}>
                    <Text style={[styles.challengeActionText, isDark && dark.text]}>{challenge?.joined ? '참여 중' : challenge ? '참여하기' : '보기'}</Text>
                  </View>
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
          <PencilIcon color="#FFFFFF" height={20} width={20} />
          <Text style={styles.composeText}>글쓰기</Text>
        </Pressable>
      )}
      {actions.elements}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
  },
  title: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30 },
  headerActions: { flexDirection: 'row' },
  badge: {
    backgroundColor: '#C62828',
    borderColor: '#FFFFFF',
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    position: 'absolute',
    right: 10,
    top: 9,
    width: 10,
  },
  tabs: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#DFE2E7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 22,
    paddingHorizontal: 20,
  },
  tab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    marginBottom: -1,
    paddingVertical: 10,
  },
  tabActive: { borderBottomColor: '#17161D' },
  tabText: { color: '#5E5D66', fontFamily: fontFamilies.pretendardRegular, fontSize: 16, lineHeight: 24 },
  tabTextActive: { color: '#17161D', fontFamily: fontFamilies.pretendardBold },
  list: { flexGrow: 1 },
  feedHeader: { backgroundColor: '#FFFFFF', paddingVertical: 16, gap: 16 },
  categories: { gap: 8, paddingHorizontal: 20 },
  categoryChip: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderWidth: 1, borderRadius: 999, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
  categoryActive: { backgroundColor: '#5246C6', borderColor: '#5246C6' },
  categoryText: { color: '#3B3A42', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  categoryTextActive: { color: '#FFFFFF' },
  challengeCard: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, marginHorizontal: 20, minHeight: 89, padding: 14 },
  challengeIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  challengeCopy: { flex: 1, gap: 6 },
  challengeTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  challengeBars: { flexDirection: 'row', gap: 4 },
  challengeBar: { backgroundColor: '#E3E6EB', borderRadius: 4, flex: 1, height: 8 },
  challengeBarDone: { backgroundColor: '#5246C6' },
  challengeDescription: { color: '#5E5D66', fontSize: 12, lineHeight: 18 },
  challengeAction: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DFE2E7', borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
  challengeActionText: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  postWrap: { backgroundColor: '#FFFFFF', borderColor: '#F2F4F6', borderTopWidth: 8 },
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
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    height: 47,
    paddingHorizontal: 20,
    position: 'absolute',
    right: 20,
  },
  composeText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
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
