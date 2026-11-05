import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeartIcon from '@/assets/icons/deco/Heart.svg';
import ChatIcon from '@/assets/icons/feature/ChatCircle.svg';
import {
  getCommunityErrorMessage,
  getCommunityProfile,
  getCommunityBookmarks,
  getCommunityUserPosts,
  getMyCommunityActivity,
  type CommunityActivityItem,
  type CommunityPost,
} from '@/src/api/community';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { COMMUNITY_POST_CATEGORY_LABELS } from '@/src/components/community';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

type Tab = 'posts' | 'comments' | 'likes' | 'scraps';
const tabs: { key: Tab; label: string }[] = [
  { key: 'posts', label: '내 글' }, { key: 'comments', label: '댓글' },
  { key: 'likes', label: '좋아요' }, { key: 'scraps', label: '스크랩' },
];

export default function CommunityActivityScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [activities, setActivities] = useState<CommunityActivityItem[]>([]);
  const [bookmarks, setBookmarks] = useState<CommunityPost[]>([]);
  const [tab, setTab] = useState<Tab>('posts');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const moreRef = useRef(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      if (tab === 'posts') {
        const profile = await getCommunityProfile('me');
        const page = await getCommunityUserPosts(profile.user_id);
        if (version !== requestVersion.current) return;
        setProfileUserId(profile.user_id);
        setCount(profile.post_count);
        setPosts(page.items);
        setCursor(page.next_cursor);
      } else if (tab === 'comments' || tab === 'likes') {
        const page = await getMyCommunityActivity(tab);
        if (version !== requestVersion.current) return;
        setActivities(page.items);
        setCursor(page.next_cursor);
      } else {
        const page = await getCommunityBookmarks();
        if (version !== requestVersion.current) return;
        setBookmarks(page.items);
        setCursor(page.next_cursor);
      }
    } catch (cause) {
      if (version === requestVersion.current) setError(getCommunityErrorMessage(cause));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [tab]);

  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => { cancelAnimationFrame(frame); requestVersion.current += 1; };
  }, [load]));

  const loadMore = useCallback(async () => {
    if (!cursor || loading || error || (tab === 'posts' && !profileUserId) || moreRef.current) return;
    const version = requestVersion.current;
    moreRef.current = true;
    setLoadingMore(true);
    try {
      if (tab === 'posts' && profileUserId) {
        const page = await getCommunityUserPosts(profileUserId, cursor);
        if (version !== requestVersion.current) return;
        setPosts((current) => {
          const seen = new Set(current.map((post) => post.post_id));
          return [...current, ...page.items.filter((post) => !seen.has(post.post_id))];
        });
        setCursor(page.next_cursor);
      } else if (tab === 'comments' || tab === 'likes') {
        const page = await getMyCommunityActivity(tab, cursor);
        if (version !== requestVersion.current) return;
        setActivities((current) => {
          const seen = new Set(current.map((item) => item.activity_id));
          return [...current, ...page.items.filter((item) => !seen.has(item.activity_id))];
        });
        setCursor(page.next_cursor);
      } else {
        const page = await getCommunityBookmarks(cursor);
        if (version !== requestVersion.current) return;
        setBookmarks((current) => {
          const seen = new Set(current.map((post) => post.post_id));
          return [...current, ...page.items.filter((post) => !seen.has(post.post_id))];
        });
        setCursor(page.next_cursor);
      }
    } catch (cause) {
      if (version === requestVersion.current) setError(getCommunityErrorMessage(cause));
    } finally {
      setLoadingMore(false);
      moreRef.current = false;
    }
  }, [cursor, error, loading, profileUserId, tab]);

  const header = (
    <>
      <View style={styles.tabs}>{tabs.map(({ key, label }) => (
        <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => { requestVersion.current += 1; setCursor(null); setLoading(true); setError(''); setTab(key); }} style={tab === key ? styles.activeTab : styles.inactiveTab}>
          <Text style={tab === key ? styles.activeTabText : styles.inactiveTabText}>{label}{key === 'posts' ? ` ${count ?? '–'}` : ''}</Text>
        </Pressable>
      ))}</View>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{tabs.find((item) => item.key === tab)?.label}{tab === 'posts' ? ` ${count ?? '–'}` : ''}</Text>
        <Text style={styles.sort}>최신순</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
      {error ? (
        <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.error}>{error} · 다시 시도하기</Text>
        </Pressable>
      ) : null}
      {!loading && !error && (tab === 'posts' ? posts.length === 0 : tab === 'scraps' ? bookmarks.length === 0 : activities.length === 0) ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{tab === 'posts' ? '아직 작성한 글이 없어요.' : '아직 활동 내역이 없어요.'}</Text>
          {tab === 'posts' ? <Pressable accessibilityRole="button" onPress={() => router.push('/community/compose')}><Text style={styles.writeLink}>첫 글 작성하기 ›</Text></Pressable> : null}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => router.back()} title="커뮤니티 활동" />
      <FlatList<CommunityPost | CommunityActivityItem>
        data={loading || error ? [] : tab === 'posts' ? posts : tab === 'scraps' ? bookmarks : activities}
        keyExtractor={(item) => tab === 'comments' || tab === 'likes' ? (item as CommunityActivityItem).activity_id : (item as CommunityPost).post_id}
        contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 32 }]}
        ListHeaderComponent={header}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => {
          const activity = tab === 'comments' || tab === 'likes' ? item as CommunityActivityItem : null;
          const post = activity?.post ?? (item as CommunityPost);
          return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="내 글 상세 보기"
            onPress={() => router.push({ pathname: '/community/[postId]', params: { postId: post.post_id } })}
            style={styles.post}
          >
            <View style={styles.postText}>
              {post.category ? <Text style={styles.category}>{COMMUNITY_POST_CATEGORY_LABELS[post.category]}</Text> : null}
              <Text numberOfLines={2} style={styles.postTitle}>{activity?.detail || post.content?.trim() || '사진 게시글'}</Text>
              {post.content ? <Text numberOfLines={2} style={styles.postPreview}>{post.content}</Text> : null}
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{(activity?.occurred_at ?? post.created_at).slice(0, 10).replace(/-/g, '.')}</Text>
                <View style={styles.reactions}>
                  <HeartIcon color={colors.textSecondary} height={14} width={14} /><Text style={styles.meta}>{post.like_count}</Text>
                  <ChatIcon color={colors.textSecondary} height={14} width={14} /><Text style={styles.meta}>{post.comment_count}</Text>
                </View>
              </View>
            </View>
            {post.images[0]?.url ? <Image source={{ uri: post.images[0].url }} style={styles.thumbnail} /> : null}
          </Pressable>
        ); }}
      />
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20 },
    header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    back: { width: 32, minHeight: 32, justifyContent: 'center' },
    title: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    tabs: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 4, gap: 2 },
    activeTab: { flex: 1, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', height: 35 },
    activeTabText: { color: colors.textPrimary, fontSize: 12, fontFamily: fontFamilies.pretendardMedium },
    inactiveTab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 35 },
    inactiveTabText: { color: colors.textSecondary, fontSize: 12 },
    tabNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
    listTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    sort: { fontSize: 12, color: colors.textSecondary },
    spinner: { marginVertical: 30 },
    errorBox: { marginVertical: 20, padding: 15, borderRadius: 12, backgroundColor: colors.dangerLight },
    error: { color: colors.danger, fontSize: 12 },
    empty: { alignItems: 'center', paddingVertical: 50, gap: 12 },
    emptyTitle: { color: colors.textSecondary, fontSize: 14 },
    writeLink: { color: colors.primary, fontSize: 14 },
    post: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 12, paddingVertical: 16 },
    postText: { flex: 1, gap: 5 },
    postTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, lineHeight: 23 },
    category: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: 8, color: colors.textBody, fontSize: 12, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
    metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    reactions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    postPreview: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    thumbnail: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.background },
  } as const;
}
