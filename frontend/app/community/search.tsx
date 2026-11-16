import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import SearchIcon from '@/assets/icons/ui/magnifying-glass.svg';
import CloseIcon from '@/assets/icons/ui/x.svg';
import { ApiError } from '@/src/api/client';
import {
  getCommunityErrorMessage, searchCommunity,
  type CommunityPost, type CommunitySearchResult,
} from '@/src/api/community';
import { CommunityAvatar } from '@/src/components/community';
import { aForm } from '@/src/components/a/form';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { BackButton, Text, TextInput } from '@/src/components/common';

type SearchTab = 'all' | 'posts' | 'routines' | 'users' | 'clubs';
const empty: CommunitySearchResult = { posts: [], routines: [], users: [], clubs: [] };

export default function CommunitySearchScreen() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
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
          ? '지금은 검색할 수 없어요. 잠시 뒤 다시 시도해 주세요.' : getCommunityErrorMessage(cause));
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
    <View style={[s.searchRow, { paddingTop: insets.top + 6 }]}>
      <BackButton onPress={() => router.back()} />
      <View style={s.inputWrap}><SearchIcon color={colors.textSecondary} height={20} width={20} /><TextInput accessibilityLabel="커뮤니티 검색어" autoFocus autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setQuery(value); setLoading(value.trim().length >= 2); setError(''); if (value.trim().length < 2) setResults(empty); }} onSubmitEditing={() => Keyboard.dismiss()} placeholder="게시글, 루틴, 사람, 클럽 검색" placeholderTextColor={colors.textSecondary} returnKeyType="search" style={s.input} value={query} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => { setQuery(''); setLoading(false); setResults(empty); setError(''); }}><CloseIcon color={colors.textSecondary} height={18} width={18} /></Pressable> : null}</View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} style={s.tabsScroll}>
      {tabs.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={[s.tab, tab === item.key && s.tabActive]}><Text style={[s.tabText, tab === item.key && s.tabTextActive]}>{item.label}{term.length >= 2 && !loading ? ` ${item.count}` : ''}</Text></Pressable>)}
    </ScrollView>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 30 }]}>
      {term.length < 2 ? <Text style={s.hint}>두 글자 이상 입력하면 커뮤니티에서 찾아드려요.</Text> : loading ? <ActivityIndicator color={colors.primaryText} style={s.loading} /> : error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((value) => value + 1); }} style={s.empty}><Text style={s.error}>{error} · 다시 시도</Text></Pressable> : visibleCount === 0 ? <View style={s.empty}><Text style={s.emptyText}>‘{term}’ 검색 결과가 없어요.</Text></View> : <>
        {showRoutines && results.routines.length > 0 ? <><Text style={s.sectionTitle}>루틴 {results.routines.length}</Text>{results.routines.map((post) => <PostRow key={`routine-${post.post_id}`} post={post} onPress={() => openPost(post)} routine />)}</> : null}
        {showPosts && regularPosts.length > 0 ? <><Text style={s.sectionTitle}>게시글 {regularPosts.length}</Text>{regularPosts.map((post) => <PostRow key={`post-${post.post_id}`} post={post} onPress={() => openPost(post)} />)}</> : null}
        {showUsers && results.users.length > 0 ? <><Text style={s.sectionTitle}>사람 {results.users.length}</Text>{results.users.map((user) => <Pressable hitSlop={16} key={user.user_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/community/user/[userId]', params: { userId: user.user_id } })} style={s.personRow}><CommunityAvatar author={user} size={38} /><View style={s.personCopy}><Text style={s.rowTitle}>{user.nickname}</Text><Text style={s.meta}>게시글 {user.post_count} · 팔로워 {user.follower_count}</Text></View><CaretRightIcon color={colors.textSecondary} height={18} width={18} /></Pressable>)}</> : null}
        {showClubs && results.clubs.length > 0 ? <><Text style={s.sectionTitle}>클럽 {results.clubs.length}</Text>{results.clubs.map((club) => <Pressable hitSlop={16} key={club.club_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/community/club/[clubId]', params: { clubId: club.club_id } })} style={s.personRow}><View style={s.clubIcon}><ChatsIcon color={colors.ink} height={22} width={22} /></View><View style={s.personCopy}><Text style={s.rowTitle}>{club.name}</Text><Text style={s.meta}>회원 {club.member_count}명 · 글 {club.post_count}개</Text></View><CaretRightIcon color={colors.textSecondary} height={18} width={18} /></Pressable>)}</> : null}
      </>}
    </ScrollView>
  </View>;
}

function PostRow({ post, onPress, routine = false }: { post: CommunityPost; onPress: () => void; routine?: boolean }) {
  const s = useThemedStyles(createSStyles);
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.postRow}>
    <View style={s.postCopy}>
      <Text style={s.category}>{routine ? '루틴 공유' : '게시글'}</Text>
      <Text numberOfLines={2} style={s.rowTitle}>{post.content || (routine ? '운동 루틴 공유' : '사진 게시글')}</Text>
      <Text style={s.meta}>{post.author.nickname} · 좋아요 {post.like_count} · 댓글 {post.comment_count}</Text>
    </View>
    {post.images[0]?.url ? <Image source={{ uri: post.images[0].url }} style={s.thumbnail} /> : null}
  </Pressable>;
}

function createSStyles({ colors }: AppTheme) {
  // Renewal A: the back card and the field in one row, small chips for what kind, each result a card.
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    searchRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 16 },
    backButton: {},
    inputWrap: { ...a.field, flex: 1, gap: 8, height: 46 },
    input: { ...a.input, flex: 1, minWidth: 0 },
    tabsScroll: { flexGrow: 0 },
    tabs: { alignItems: 'center', gap: 6, paddingBottom: 3, paddingHorizontal: 16 },
    tab: a.mini,
    tabActive: a.on,
    tabText: a.miniText,
    tabTextActive: a.onText,
    content: { gap: 10, paddingHorizontal: 16, paddingTop: 14 },
    hint: { ...a.note, marginTop: 18, textAlign: 'center' },
    loading: { marginTop: 35 },
    sectionTitle: { ...a.note, marginHorizontal: 2, marginTop: 8 },
    postRow: { ...a.card, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
    postCopy: { flex: 1, gap: 4 },
    thumbnail: { backgroundColor: colors.track, borderColor: colors.ink, borderRadius: 10, borderWidth: 2, height: 64, width: 64 },
    category: a.note,
    rowTitle: { ...a.p15, color: colors.ink },
    meta: a.note,
    personRow: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 10, padding: 12 },
    personCopy: { flex: 1, gap: 2 },
    clubIcon: {
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 11,
      borderWidth: 2,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    empty: { alignItems: 'center', marginTop: 20, padding: 20 },
    emptyText: { ...a.note, textAlign: 'center' },
    error: { ...a.p12, color: colors.danger, textAlign: 'center' },
  } as const;
}
