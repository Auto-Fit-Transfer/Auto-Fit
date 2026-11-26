import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/src/api/client';

import SearchIcon from '@/assets/icons/ui/magnifying-glass.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import {
  getCommunityChallenges,
  getCommunityErrorMessage,
  getCommunityFeed,
  type CommunityAuthor,
  type CommunityChallenge,
  type CommunityFeedScope,
  type CommunityPost,
  type CommunityPostCategory,
} from '@/src/api/community';
import { aForm } from '@/src/components/a/form';
import { IconButton, Text } from '@/src/components/common';
import { Headline } from '@/src/components/b/Headline';
import { feedHeadline } from '@/src/features/b/feedHeadline';
import { NotificationBell } from '@/src/components/community/NotificationBell';
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
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

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
    challenge.joined ? `${challenge.progress}/${challenge.goal}${unit}` : `목표 ${challenge.goal}${unit}`,
    left <= 0 ? '오늘 마감' : `${left}일 남음`,
  ].join(' · ');
}

export default function CommunityScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const simpleStyles = useThemedStyles(createSimpleStylesStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const { height: windowHeight } = useWindowDimensions();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [scope, setScope] = useState<CommunityFeedScope>('all');
  const [activeCategory, setActiveCategory] = useState<CommunityPostCategory | null>(null);
  // Clubs and challenges replace the feed list; the feed keeps its scope underneath.
  const [pane, setPane] = useState<'clubs' | 'challenges' | null>(null);
  const activeTab: Tab = pane === 'clubs' ? pane : scope;
  const [challenge, setChallenge] = useState<CommunityChallenge | null>(null);
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  // What the headline says, from the first page of 추천 (all kinds) or 팔로잉; kept while a kind is picked.
  const [headline, setHeadline] = useState(() => feedHeadline([], false, false));
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
        if (scope !== 'all' || !activeCategory) setHeadline(feedHeadline(page.items, page.next_cursor !== null, scope === 'following'));
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

  useFocusEffect(
    useCallback(() => {
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
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.top}>
          <Text accessibilityRole="header" style={styles.title}>
            커뮤니티
          </Text>
          <View style={styles.headerActions}>
            <IconButton
              accessibilityLabel="커뮤니티 검색"
              icon={<SearchIcon color={colors.textPrimary} height={20} width={20} />}
              onPress={() => router.push('/community/search')}
              size={40}
              style={styles.headerCard}
            />
            <NotificationBell />
          </View>
        </View>
        {pane ? null : <Headline lines={headline} />}
        {simple ? <View style={simpleStyles.readRow}><Text style={simpleStyles.readHint}>추천 글과 클럽을 둘러보세요</Text><SimpleReadButton text={`커뮤니티입니다. ${activeTab === 'clubs' ? '클럽' : activeTab === 'following' ? '팔로잉' : '추천'} 탭을 보고 있어요. ${items.length}개의 글이 있습니다.`} /></View> : null}
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
      </View>

      {pane === 'clubs' ? (
        <CommunityClubsPane bottomSpace={bottomSpace} />
      ) : pane === 'challenges' ? (
        <CommunityChallengesPane bottomSpace={bottomSpace} onBack={() => setPane(null)} />
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
              <View style={styles.feedHeader}>
                <ScrollView contentContainerStyle={styles.categories} horizontal showsHorizontalScrollIndicator={false}>
                  {CATEGORIES.map((category) => (
                    <Pressable hitSlop={{ bottom: 1, top: 1 }}
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
                {/* The challenge I am in: a day a circle (up to 7), and how far I am. */}
                <Pressable accessibilityRole="button" onPress={() => setPane('challenges')} style={[styles.challengeCard, simple && simpleStyles.challengeCard]}>
                  <View style={styles.challengeCopy}>
                    <Text style={styles.challengeSmall}>{challenge ? `챌린지 · ${challenge.participant_count.toLocaleString()}명 참여` : '챌린지'}</Text>
                    <Text style={[styles.challengeTitle, simple && simpleStyles.challengeTitle]}>{challenge?.title ?? '함께 목표에 도전해 보세요'}</Text>
                    {challenge ? (
                      <View style={styles.challengeLine}>
                        {challenge.goal <= 7 ? (
                          <View accessibilityLabel={`${challenge.goal} 가운데 ${challenge.joined ? challenge.progress : 0}`} accessible style={styles.challengeDays}>
                            {Array.from({ length: challenge.goal }, (_, index) => (
                              <View key={index} style={[styles.challengeDay, index < challenge.progress && challenge.joined && styles.challengeDayDone]} />
                            ))}
                          </View>
                        ) : null}
                        <Text style={styles.challengeSmall}>{challengeSummary(challenge)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.challengeAction}>
                    <Text style={styles.challengeActionText}>{challenge?.joined ? '참여 중' : challenge ? '참여하기' : '보기'}</Text>
                  </View>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            scope === 'following' ? (
              <View style={[styles.center, styles.message]}>
                <Text style={styles.emptyTitle}>팔로우한 사람의 글이 여기에 보여요</Text>
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
            <View style={styles.postWrap}><CommunityPostCard
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
          style={({ pressed }) => [styles.compose, { bottom: bottomSpace + 16 }, pressed && styles.composePressed]}
        >
          <PlusIcon color={colors.onPrimary} height={18} width={18} />
          <Text style={styles.composeText}>글쓰기</Text>
        </Pressable>
      )}
      {actions.elements}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  // Renewal B (b-community.html): the name and two round buttons, the headline, 추천 · 팔로잉 · 클럽 as one
  // light segment, the kinds as chips, the challenge as a white card with a circle a day, then the posts.
  const a = aForm(colors);
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    header: { backgroundColor: colors.background, gap: 16, paddingBottom: 4, paddingHorizontal: 20 },
    top: { alignItems: 'center', flexDirection: 'row', minHeight: 40 },
    title: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
    headerActions: { flexDirection: 'row', gap: 6 },
    headerCard: { backgroundColor: colors.surface, borderRadius: 20 },
    tabs: { backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', padding: 4 },
    tab: { alignItems: 'center', borderRadius: 999, flex: 1, height: 40, justifyContent: 'center' },
    tabActive: { backgroundColor: colors.primary },
    tabText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    tabTextActive: { color: colors.onPrimary },
    list: { flexGrow: 1 },
    feedHeader: { gap: 14, paddingTop: 12 },
    categories: { gap: 6, paddingHorizontal: 20 },
    categoryChip: { ...a.chip, backgroundColor: colors.surface, height: 38, paddingHorizontal: 14 },
    categoryActive: a.on,
    categoryText: a.chipText,
    categoryTextActive: a.onText,
    challengeCard: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 12, marginHorizontal: 20, paddingHorizontal: 20, paddingVertical: 18 },
    challengeCopy: { flex: 1, gap: 2, minWidth: 0 },
    challengeSmall: { ...a.p12, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    challengeTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22, marginBottom: 6 },
    challengeLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    challengeDays: { flexDirection: 'row', gap: 5 },
    challengeDay: { backgroundColor: colors.surfaceMuted, borderRadius: 5, height: 10, width: 10 },
    challengeDayDone: { backgroundColor: colors.textPrimary },
    challengeAction: a.mini,
    challengeActionText: a.miniText,
    postWrap: { marginHorizontal: 20, marginTop: 14 },
    center: { flex: 1, justifyContent: 'center' },
    message: { alignItems: 'center', gap: 6, padding: 32 },
    emptyTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 22, textAlign: 'center' },
    messageText: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 21, textAlign: 'center' },
    footer: { paddingVertical: 16 },
    compose: { ...a.go, boxShadow: '0 6px 18px rgba(1,1,1,0.22)', gap: 6, height: 50, paddingLeft: 16, paddingRight: 20, position: 'absolute', right: 20 },
    composeText: { ...a.goText, fontSize: 14.5 },
    composePressed: a.goPressed,
  } as const;
}

function createSimpleStylesStyles({ colors }: AppTheme) {
  return {
    title: {},
    readRow: { alignItems: 'center', backgroundColor: colors.background, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    readHint: { color: colors.textSecondary, flex: 1 },
    tab: { minHeight: 52 },
    tabText: {},
    categoryChip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
    categoryText: {},
    challengeCard: { minHeight: 82, padding: 16 },
    challengeTitle: {},
  } as const;
}
