import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { koreanDate } from '@/src/lib/koreanDate';
import { CaretText } from '@/src/components/common/CaretText';
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
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
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
          {tab === 'posts' ? <Pressable accessibilityRole="button" onPress={() => router.push('/community/compose')}><CaretText style={styles.writeLink}>첫 글 작성하기</CaretText></Pressable> : null}
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
                <Text style={styles.meta}>{koreanDate(activity?.occurred_at ?? post.created_at)}</Text>
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
  // Renewal A: small outlined tabs (violet = the one open), then one line for each post.
  const a = aForm(colors);
  const tab = { ...a.mini, flex: 1, height: 36, paddingHorizontal: 2 } as const;
  return {
    screen: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { paddingHorizontal: 16 },
    tabs: { flexDirection: 'row', gap: 6 },
    activeTab: { ...tab, backgroundColor: colors.primary },
    activeTabText: { ...a.miniText, color: colors.onPrimary },
    inactiveTab: tab,
    inactiveTabText: a.miniText,
    listHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, marginTop: 20 },
    listTitle: { ...a.p15, color: colors.ink },
    sort: a.note,
    spinner: { marginVertical: 30 },
    errorBox: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginVertical: 16, padding: 14 },
    error: { ...a.p12, color: colors.danger },
    empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
    emptyTitle: { ...a.p15, color: colors.textBody },
    writeLink: { ...a.p12, color: colors.ink, textDecorationLine: 'underline' },
    post: { borderBottomColor: colors.track, borderBottomWidth: 2, flexDirection: 'row', gap: 12, paddingVertical: 14 },
    postText: { flex: 1, gap: 4 },
    postTitle: { ...a.p15, color: colors.ink },
    category: { ...a.p12, alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 6, color: colors.ink, overflow: 'hidden', paddingHorizontal: 6 },
    metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    reactions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    postPreview: a.note,
    meta: a.note,
    thumbnail: { backgroundColor: colors.track, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 72, width: 72 },
  } as const;
}
