import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import Back from '@/assets/figma/main/a08ac.svg';
import {
  getCommunityErrorMessage,
  getCommunityProfile,
  getCommunityBookmarks,
  getCommunityUserPosts,
  getMyCommunityActivity,
  type CommunityActivityItem,
  type CommunityPost,
} from '@/src/api/community';
import { colors, fontFamilies } from '@/src/theme';

type Tab = 'posts' | 'comments' | 'likes' | 'scraps';
const tabs: { key: Tab; label: string }[] = [
  { key: 'posts', label: '내 글' }, { key: 'comments', label: '댓글' },
  { key: 'likes', label: '좋아요' }, { key: 'scraps', label: '스크랩' },
];

export default function CommunityActivityScreen() {
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
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}><Back /></Pressable>
        <Text style={styles.title}>커뮤니티 활동</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.tabs}>{tabs.map(({ key, label }) => (
        <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => { requestVersion.current += 1; setCursor(null); setLoading(true); setError(''); setTab(key); }} style={tab === key ? styles.activeTab : styles.inactiveTab}>
          <Text style={tab === key ? styles.activeTabText : styles.inactiveTabText}>{label}{key === 'posts' ? ` ${count ?? '–'}` : ''}</Text>
        </Pressable>
      ))}</View>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{tabs.find((item) => item.key === tab)?.label}{tab === 'posts' ? ` ${count ?? '–'}` : ''}</Text>
        <Text style={styles.sort}>최신순⌄</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.primaryDark} style={styles.spinner} /> : null}
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
      <StatusBar style="dark" />
      <FlatList<CommunityPost | CommunityActivityItem>
        data={loading || error ? [] : tab === 'posts' ? posts : tab === 'scraps' ? bookmarks : activities}
        keyExtractor={(item) => tab === 'comments' || tab === 'likes' ? (item as CommunityActivityItem).activity_id : (item as CommunityPost).post_id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        ListHeaderComponent={header}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primaryDark} /> : null}
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
              <Text numberOfLines={2} style={styles.postTitle}>{activity?.detail || post.content?.trim() || '사진 게시글'}</Text>
              {post.content ? <Text numberOfLines={2} style={styles.postPreview}>{post.content}</Text> : null}
              <Text style={styles.meta}>{(activity?.occurred_at ?? post.created_at).slice(0, 10)} · 좋아요 {post.like_count} · 댓글 {post.comment_count}</Text>
            </View>
            {post.images[0]?.url ? <Image source={{ uri: post.images[0].url }} style={styles.thumbnail} /> : null}
          </Pressable>
        ); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20 },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  back: { width: 32, minHeight: 32, justifyContent: 'center' },
  title: { fontSize: 17, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  tabs: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 12, padding: 4, gap: 2 },
  activeTab: { flex: 1, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', height: 35 },
  activeTabText: { color: colors.textPrimary, fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold },
  inactiveTab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 35 },
  inactiveTabText: { color: colors.textSecondary, fontSize: 12 },
  tabNote: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 8 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
  listTitle: { fontSize: 14, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  sort: { fontSize: 12, color: colors.textSecondary },
  spinner: { marginVertical: 30 },
  errorBox: { marginVertical: 20, padding: 15, borderRadius: 10, backgroundColor: colors.dangerLight },
  error: { color: colors.danger, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyTitle: { color: colors.textSecondary, fontSize: 14 },
  writeLink: { color: colors.primaryDark, fontSize: 13 },
  post: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 12, paddingVertical: 15 },
  postText: { flex: 1, gap: 5 },
  postTitle: { fontSize: 14, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, lineHeight: 20 },
  postPreview: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  meta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  thumbnail: { width: 54, height: 54, borderRadius: 9, backgroundColor: colors.background },
});
