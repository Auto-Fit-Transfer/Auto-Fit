import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/src/api/client';
import {
  getCommunityErrorMessage, searchCommunity,
  type CommunityPost, type CommunitySearchResult,
} from '@/src/api/community';
import { CommunityAvatar } from '@/src/components/community';
import { fontFamilies } from '@/src/theme';

type SearchTab = 'all' | 'posts' | 'routines' | 'users' | 'clubs';
const purple = '#503DD7';
const ink = '#1E1D24';
const muted = '#777681';
const empty: CommunitySearchResult = { posts: [], routines: [], users: [], clubs: [] };

export default function CommunitySearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const [results, setResults] = useState<CommunitySearchResult>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const term = query.trim();

  useEffect(() => {
    let active = true;
    if (term.length < 2) {
      return () => { active = false; };
    }
    const timer = setTimeout(() => {
      void searchCommunity(term).then((next) => {
        if (active) setResults(next);
      }).catch((cause) => {
        if (active) setError(cause instanceof ApiError && cause.status === 404
          ? '검색 API가 서버에 아직 배포되지 않았어요.' : getCommunityErrorMessage(cause));
      }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [term, retry]);

  const openPost = (post: CommunityPost) => {
    Keyboard.dismiss();
    router.push({ pathname: '/community/[postId]', params: { postId: post.post_id } });
  };
  const routineIds = new Set(results.routines.map((post) => post.post_id));
  const regularPosts = results.posts.filter((post) => !routineIds.has(post.post_id));
  const tabs: { key: SearchTab; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: results.posts.length + results.users.length + results.clubs.length },
    { key: 'posts', label: '게시글', count: regularPosts.length },
    { key: 'routines', label: '루틴', count: results.routines.length },
    { key: 'users', label: '사람', count: results.users.length },
    { key: 'clubs', label: '클럽', count: results.clubs.length },
  ];
  const showRoutines = tab === 'all' || tab === 'routines';
  const showPosts = tab === 'all' || tab === 'posts';
  const showUsers = tab === 'all' || tab === 'users';
  const showClubs = tab === 'all' || tab === 'clubs';
  const visibleCount = tab === 'all' ? tabs[0].count : tabs.find((item) => item.key === tab)?.count ?? 0;

  return <View style={s.root}>
    <StatusBar style="dark" />
    <View style={[s.searchRow, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={s.backButton}><Text style={s.back}>‹</Text></Pressable>
      <View style={s.inputWrap}><Text style={s.searchIcon}>⌕</Text><TextInput accessibilityLabel="커뮤니티 검색어" autoFocus autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setQuery(value); setLoading(value.trim().length >= 2); setError(''); if (value.trim().length < 2) setResults(empty); }} onSubmitEditing={() => Keyboard.dismiss()} placeholder="게시글, 루틴, 사람, 클럽 검색" returnKeyType="search" style={s.input} value={query} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => { setQuery(''); setLoading(false); setResults(empty); setError(''); }}><Text style={s.clear}>×</Text></Pressable> : null}</View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} style={s.tabsScroll}>
      {tabs.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={[s.tab, tab === item.key && s.tabActive]}><Text style={[s.tabText, tab === item.key && s.tabTextActive]}>{item.label}{term.length >= 2 && !loading ? ` ${item.count}` : ''}</Text></Pressable>)}
    </ScrollView>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 30 }]}>
      {term.length < 2 ? <Text style={s.hint}>두 글자 이상 입력하면 커뮤니티에서 찾아드려요.</Text> : loading ? <ActivityIndicator color={purple} style={s.loading} /> : error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={s.empty}><Text style={s.error}>{error} · 다시 시도</Text></Pressable> : visibleCount === 0 ? <View style={s.empty}><Text style={s.emptyText}>‘{term}’ 검색 결과가 없어요.</Text></View> : <>
        {showRoutines && results.routines.length > 0 ? <><Text style={s.sectionTitle}>루틴 {results.routines.length}</Text>{results.routines.map((post) => <PostRow key={`routine-${post.post_id}`} post={post} onPress={() => openPost(post)} routine />)}</> : null}
        {showPosts && regularPosts.length > 0 ? <><Text style={s.sectionTitle}>게시글 {regularPosts.length}</Text>{regularPosts.map((post) => <PostRow key={`post-${post.post_id}`} post={post} onPress={() => openPost(post)} />)}</> : null}
        {showUsers && results.users.length > 0 ? <><Text style={s.sectionTitle}>사람 {results.users.length}</Text>{results.users.map((user) => <Pressable key={user.user_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/community/user/[userId]', params: { userId: user.user_id } })} style={s.personRow}><CommunityAvatar author={user} size={38} /><View style={s.personCopy}><Text style={s.rowTitle}>{user.nickname}</Text><Text style={s.meta}>게시글 {user.post_count} · 팔로워 {user.follower_count}</Text></View><Text style={s.chevron}>›</Text></Pressable>)}</> : null}
        {showClubs && results.clubs.length > 0 ? <><Text style={s.sectionTitle}>클럽 {results.clubs.length}</Text>{results.clubs.map((club) => <Pressable key={club.club_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/community/club/[clubId]', params: { clubId: club.club_id } })} style={s.personRow}><View style={s.clubIcon}><Text style={s.clubIconText}>♧</Text></View><View style={s.personCopy}><Text style={s.rowTitle}>{club.name}</Text><Text style={s.meta}>회원 {club.member_count}명 · 글 {club.post_count}개</Text></View><Text style={s.chevron}>›</Text></Pressable>)}</> : null}
      </>}
    </ScrollView>
  </View>;
}

function PostRow({ post, onPress, routine = false }: { post: CommunityPost; onPress: () => void; routine?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.postRow}>
    <Text style={s.category}>{routine ? '루틴 공유' : '게시글'}</Text>
    <Text numberOfLines={2} style={s.rowTitle}>{post.content || (routine ? '운동 루틴 공유' : '사진 게시글')}</Text>
    <Text style={s.meta}>{post.author.nickname} · 좋아요 {post.like_count} · 댓글 {post.comment_count}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 13, gap: 8 },
  backButton: { width: 30, alignItems: 'center' }, back: { color: ink, fontSize: 32, lineHeight: 36 },
  inputWrap: { flex: 1, height: 42, backgroundColor: '#F7F8FA', borderColor: '#E2E4E8', borderWidth: 1, borderRadius: 23, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  searchIcon: { color: muted, fontSize: 22 }, input: { flex: 1, fontSize: 13, color: ink }, clear: { fontSize: 20, color: muted, paddingHorizontal: 4 },
  tabsScroll: { flexGrow: 0, borderBottomColor: '#ECECF0', borderBottomWidth: 1 },
  tabs: { paddingHorizontal: 20, gap: 20, alignItems: 'center' }, tab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: ink }, tabText: { fontSize: 13, color: muted }, tabTextActive: { color: ink, fontFamily: fontFamilies.pretendardSemiBold },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 10 }, hint: { color: muted, fontSize: 13, marginTop: 18 }, loading: { marginTop: 35 },
  sectionTitle: { color: ink, fontSize: 15, fontFamily: fontFamilies.pretendardBold, marginTop: 10 },
  postRow: { borderBottomWidth: 1, borderBottomColor: '#ECECF0', paddingVertical: 11, gap: 5 }, category: { color: muted, fontSize: 11 }, rowTitle: { color: ink, fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold, lineHeight: 20 }, meta: { color: muted, fontSize: 11 },
  personRow: { borderColor: '#E2E4E8', borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, personCopy: { flex: 1, gap: 3 }, chevron: { color: muted, fontSize: 21 }, clubIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F0EEFC', alignItems: 'center', justifyContent: 'center' }, clubIconText: { color: purple, fontSize: 22 },
  empty: { backgroundColor: '#F8F8FA', borderRadius: 12, padding: 20, marginTop: 20, alignItems: 'center' }, emptyText: { color: muted, fontSize: 13 }, error: { color: '#A13A2F', fontSize: 12 },
});
