import BookmarkIcon from '@/assets/icons/deco/BookmarkSimple.svg';
import BookmarkFillIcon from '@/assets/icons/deco/BookmarkSimple_Fill.svg';
import ArrowUpIcon from '@/assets/icons/common/chevrons/Up.svg';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COMMUNITY_MAX_COMMENT_LENGTH,
  createCommunityComment,
  getCommunityComments,
  getCommunityErrorCode,
  getCommunityErrorMessage,
  getCommunityPost,
  getCommunityBookmarkState,
  getCommunityProfile,
  setCommunityBookmark,
  type CommunityAuthor,
  type CommunityComment,
  type CommunityPost,
  type CommunityProfile,
} from '@/src/api/community';
import { aForm } from '@/src/components/a/form';
import { AppButton, AppHeader, Text, TextInput } from '@/src/components/common';
import { CommunityCommentRow, CommunityPostCard } from '@/src/components/community';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import {
  emitCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

// Comments come oldest first; a freshly sent comment may arrive before older pages.
function mergeComments(current: CommunityComment[], incoming: CommunityComment[]) {
  const byId = new Map(current.map((comment) => [comment.comment_id, comment]));
  incoming.forEach((comment) => byId.set(comment.comment_id, comment));
  return [...byId.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.comment_id.localeCompare(b.comment_id),
  );
}

export default function CommunityPostScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const openProfile = (author: CommunityAuthor) =>
    router.push({ params: { userId: author.user_id }, pathname: '/community/user/[userId]' });
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const actions = useCommunityActions();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [authorProfile, setAuthorProfile] = useState<CommunityProfile | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkAvailable, setBookmarkAvailable] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const loadingMore = useRef(false);
  const postRef = useRef<CommunityPost | null>(null);
  const commentInputRef = useRef<TextInput>(null);

  useEffect(() => {
    postRef.current = post;
  }, [post]);

  const load = useCallback(async () => {
    if (!postId) return;
    try {
      const [loadedPost, page, saved] = await Promise.all([
        getCommunityPost(postId),
        getCommunityComments(postId),
        getCommunityBookmarkState(postId).catch(() => null),
      ]);
      setPost(loadedPost);
      setBookmarkAvailable(saved !== null);
      setBookmarked(saved?.bookmarked ?? false);
      setAuthorProfile(null);
      getCommunityProfile(loadedPost.author.user_id).then(setAuthorProfile, () => setAuthorProfile(null));
      setComments(page.items);
      setCursor(page.next_cursor);
      setState('ready');
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
      setState(getCommunityErrorCode(error) === 'COMMUNITY_POST_NOT_FOUND' ? 'missing' : 'error');
    }
  }, [postId]);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  useEffect(
    () =>
      subscribeCommunityEvents((event) => {
        const current = postRef.current;
        if (!current) return;
        if (event.type === 'updated' && event.postId === current.post_id) {
          setPost((value) => (value ? { ...value, ...event.patch } : value));
        } else if (
          (event.type === 'removed' && event.postId === current.post_id) ||
          (event.type === 'blocked' && event.userId === current.author.user_id)
        ) {
          setState('missing');
        } else if (event.type === 'blocked') {
          setComments((value) =>
            value.filter((comment) => comment.author.user_id !== event.userId),
          );
        } else if (event.type === 'followed' && event.userId === current.author.user_id) {
          setAuthorProfile((value) => value && { ...value, followed_by_me: event.following, follower_count: event.followerCount ?? value.follower_count });
        }
      }),
    [],
  );

  const loadMore = async () => {
    if (!postId || !cursor || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await getCommunityComments(postId, cursor);
      setComments((current) => mergeComments(current, page.items));
      setCursor(page.next_cursor);
    } catch (error) {
      actions.notify(getCommunityErrorMessage(error));
    } finally {
      loadingMore.current = false;
    }
  };

  const changeCommentCount = (delta: number) => {
    const current = postRef.current;
    if (!current) return;
    emitCommunityEvent({
      patch: { comment_count: Math.max(0, current.comment_count + delta) },
      postId: current.post_id,
      type: 'updated',
    });
  };

  const send = async () => {
    const current = postRef.current;
    const content = draft.trim();
    if (!current || !content || sending) return;
    setSending(true);
    try {
      const comment = await createCommunityComment(current.post_id, content);
      setComments((value) => mergeComments(value, [comment]));
      setDraft('');
      changeCommentCount(1);
    } catch (error) {
      actions.handleError(error, current.post_id, () => void send());
    } finally {
      setSending(false);
    }
  };

  const removeComment = (commentId: string) =>
    setComments((value) => value.filter((comment) => comment.comment_id !== commentId));

  const toggleBookmark = async () => {
    if (!post || bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      const result = await setCommunityBookmark(post.post_id, !bookmarked);
      setBookmarked(result.bookmarked);
    } catch (cause) {
      actions.notify(getCommunityErrorMessage(cause));
    } finally {
      setBookmarkBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AppHeader onBackPress={() => router.back()} title="게시글" />
      {simple ? <View style={styles.readRow}><SimpleReadButton text={post ? `${post.author.nickname}님의 게시글입니다. ${post.content ?? ''} 댓글 ${post.comment_count}개가 있어요.` : '게시글을 불러오는 중이에요.'} /></View> : null}
      {state === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.center} />
      ) : state !== 'ready' || !post ? (
        <View style={[styles.center, styles.message]}>
          <Text style={styles.messageText}>
            {state === 'missing' ? '삭제되었거나 볼 수 없는 글이에요.' : errorMessage}
          </Text>
          <AppButton
            fullWidth={false}
            onPress={() => {
              if (state === 'missing') {
                router.back();
              } else {
                setState('loading');
                void load();
              }
            }}
            title={state === 'missing' ? '돌아가기' : '다시 시도'}
          />
        </View>
      ) : (
        <>
          <FlatList
            data={comments}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(comment) => comment.comment_id}
            ListEmptyComponent={<Text style={styles.empty}>첫 댓글을 남겨 보세요.</Text>}
            ListHeaderComponent={
              <>
                <CommunityPostCard
                  expanded
                  followProfile={authorProfile}
                  onAuthorPress={openProfile}
                  onComment={() => commentInputRef.current?.focus()}
                  onFollow={() => authorProfile && void actions.toggleFollow(authorProfile, authorProfile.follower_count)}
                  onLike={() => void actions.toggleLike(post)}
                  onMore={() => actions.openPostMenu(post)}
                  onRepost={() => void actions.toggleRepost(post)}
                  post={post}
                />
                {bookmarkAvailable ? <Pressable hitSlop={{ bottom: 4, top: 4 }} accessibilityRole="button" accessibilityState={{ selected: bookmarked, disabled: bookmarkBusy }} disabled={bookmarkBusy} onPress={() => void toggleBookmark()} style={styles.bookmarkButton}>
                  {bookmarked ? <BookmarkFillIcon color={colors.textPrimary} height={16} width={16} /> : <BookmarkIcon color={colors.textPrimary} height={16} width={16} />}
                  <Text style={styles.bookmarkText}>{bookmarked ? '스크랩됨' : '스크랩'}</Text>
                </Pressable> : null}
                <View style={styles.commentsHeading}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>댓글 {post.comment_count.toLocaleString()}</Text>
                  <Text style={styles.sortLabel}>등록순</Text>
                </View>
              </>
            }
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.4}
            renderItem={({ item }) => (
              <CommunityCommentRow
                comment={item}
                onAuthorPress={openProfile}
                onMore={() =>
                  actions.openCommentMenu(item, {
                    onDeleted: () => {
                      removeComment(item.comment_id);
                      changeCommentCount(-1);
                    },
                    onHidden: () => removeComment(item.comment_id),
                  })
                }
              />
            )}
          />
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <TextInput
              accessibilityLabel="댓글 입력"
              ref={commentInputRef}
              maxLength={COMMUNITY_MAX_COMMENT_LENGTH}
              lineBreakStrategyIOS="hangul-word"
              multiline
              onChangeText={setDraft}
              placeholder="댓글을 남겨 보세요"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, simple && simpleStyles.input]}
              value={draft}
            />
            <Pressable
              accessibilityLabel="댓글 보내기"
              accessibilityRole="button"
              accessibilityState={{ disabled: !draft.trim() || sending }}
              disabled={!draft.trim() || sending}
              onPress={() => void send()}
              style={[styles.send, (!draft.trim() || sending) && styles.sendOff]}
            >
              <ArrowUpIcon color={colors.onPrimary} height={20} width={20} />
            </Pressable>
          </View>
        </>
      )}
      {actions.elements}
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    readRow: { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 4 },
    center: { flex: 1, justifyContent: 'center' },
    message: { alignItems: 'center', gap: 12, padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    // Renewal B: 스크랩 a small pill at the right under the post, the comments as plain rows, and the
    // comment bar a white pill field with a round black send button.
    sectionTitle: { ...a.note, fontFamily: fontFamilies.pretendardMedium },
    commentsHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 4, paddingHorizontal: 24, paddingTop: 18 },
    sortLabel: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    bookmarkButton: { ...a.mini, alignSelf: 'flex-end', backgroundColor: colors.surface, flexDirection: 'row', gap: 6, height: 36, marginRight: 20, marginTop: 4 },
    bookmarkText: a.miniText,
    empty: { ...a.note, fontFamily: fontFamilies.pretendardRegular, paddingVertical: 32, textAlign: 'center' },
    inputBar: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10 },
    input: {
      ...a.input,
      backgroundColor: colors.surface,
      borderRadius: 24,
      flex: 1,
      maxHeight: 110,
      minHeight: 46,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    send: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 23, height: 46, justifyContent: 'center', width: 46 },
    sendOff: { backgroundColor: colors.textDisabled },
  } as const;
}

const simpleStyles = StyleSheet.create({
  input: { minHeight: 52 },
});
