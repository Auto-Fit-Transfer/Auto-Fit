import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SendIcon from '@/assets/icons/feature/PaperPlane_Fill.svg';
import {
  COMMUNITY_MAX_COMMENT_LENGTH,
  createCommunityComment,
  getCommunityComments,
  getCommunityErrorCode,
  getCommunityErrorMessage,
  getCommunityPost,
  type CommunityAuthor,
  type CommunityComment,
  type CommunityPost,
} from '@/src/api/community';
import { AppButton, AppHeader, IconButton, Text } from '@/src/components/common';
import { CommunityCommentRow, CommunityPostCard } from '@/src/components/community';
import {
  emitCommunityEvent,
  subscribeCommunityEvents,
} from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

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
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const openProfile = (author: CommunityAuthor) =>
    router.push({ params: { userId: author.user_id }, pathname: '/community/user/[userId]' });
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const loadingMore = useRef(false);
  const postRef = useRef<CommunityPost | null>(null);

  useEffect(() => {
    postRef.current = post;
  }, [post]);

  const load = useCallback(async () => {
    if (!postId) return;
    try {
      const [loadedPost, page] = await Promise.all([
        getCommunityPost(postId),
        getCommunityComments(postId),
      ]);
      setPost(loadedPost);
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AppHeader onBackPress={() => router.back()} title="게시글" />
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
                  onAuthorPress={openProfile}
                  onLike={() => void actions.toggleLike(post)}
                  onMore={() => actions.openPostMenu(post)}
                  onRepost={() => void actions.toggleRepost(post)}
                  post={post}
                />
                <Text style={styles.sectionTitle}>댓글 {post.comment_count.toLocaleString()}</Text>
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
              lineBreakStrategyIOS="hangul-word"
              maxLength={COMMUNITY_MAX_COMMENT_LENGTH}
              multiline
              onChangeText={setDraft}
              placeholder="댓글을 남겨 보세요"
              placeholderTextColor={colors.textNavigator}
              style={styles.input}
              value={draft}
            />
            <IconButton
              accessibilityLabel="댓글 보내기"
              disabled={!draft.trim() || sending}
              icon={<SendIcon color={colors.primary} height={24} width={24} />}
              onPress={() => void send()}
              size={44}
            />
          </View>
        </>
      )}
      {actions.elements}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  message: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  messageText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: spacing.xxl,
    textAlign: 'center',
  },
  inputBar: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    color: colors.textPrimary,
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
});
