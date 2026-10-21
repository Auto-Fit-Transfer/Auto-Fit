import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COMMUNITY_REPORT_REASONS,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityErrorCode,
  getCommunityErrorMessage,
  isNicknameRequired,
  reportCommunityContent,
  setCommunityBlock,
  setCommunityFollow,
  setCommunityLike,
  setCommunityRepost,
  type CommunityAuthor,
  type CommunityComment,
  type CommunityPost,
  type CommunityReportReason,
  type CommunityReportTarget,
} from '@/src/api/community';
import { AppDialog } from '@/src/components/common';
import {
  CommunityOptionsSheet,
  type CommunityOption,
} from '@/src/components/community/CommunityOptionsSheet';
import { NicknameDialog } from '@/src/components/community/NicknameDialog';
import { ReportDetailDialog } from '@/src/components/community/ReportDetailDialog';
import { colors, fontFamilies, radius, shadows, spacing } from '@/src/theme';

import { emitCommunityEvent } from './communityEvents';

type Confirm = {
  title: string;
  description: string;
  confirmText: string;
  run: () => Promise<void>;
};

// Like/repost update optimistically through communityEvents so every open screen agrees.
// Alert.alert is a no-op on web, so results are shown in a small notice banner instead.
export function useCommunityActions() {
  const insets = useSafeAreaInsets();
  const pending = useRef(new Set<string>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sheet, setSheet] = useState<{ title?: string; options: CommunityOption[] } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [nicknameRetry, setNicknameRetry] = useState<(() => void) | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<{
    type: CommunityReportTarget;
    id: string;
    reason: (typeof COMMUNITY_REPORT_REASONS)[number];
    onDone: () => void;
  } | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const once = async (key: string, task: () => Promise<void>) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    try {
      await task();
    } finally {
      pending.current.delete(key);
    }
  };

  const handleError = (error: unknown, postId?: string, retry?: () => void) => {
    if (retry && isNicknameRequired(error)) {
      setNicknameRetry(() => retry);
      return;
    }
    if (postId && getCommunityErrorCode(error) === 'COMMUNITY_POST_NOT_FOUND') {
      emitCommunityEvent({ type: 'removed', postId });
    }
    notify(getCommunityErrorMessage(error));
  };

  const update = (postId: string, patch: Partial<CommunityPost>) =>
    emitCommunityEvent({ type: 'updated', patch, postId });

  const toggleLike = (post: CommunityPost) =>
    once(`like:${post.post_id}`, async () => {
      const liked = !post.liked_by_me;
      update(post.post_id, {
        like_count: Math.max(0, post.like_count + (liked ? 1 : -1)),
        liked_by_me: liked,
      });
      try {
        const result = await setCommunityLike(post.post_id, liked);
        update(post.post_id, { like_count: result.like_count, liked_by_me: result.liked });
      } catch (error) {
        update(post.post_id, { like_count: post.like_count, liked_by_me: post.liked_by_me });
        handleError(error, post.post_id);
      }
    });

  const toggleRepost = (post: CommunityPost): Promise<void> =>
    once(`repost:${post.post_id}`, async () => {
      const reposted = !post.reposted_by_me;
      update(post.post_id, {
        repost_count: Math.max(0, post.repost_count + (reposted ? 1 : -1)),
        reposted_by_me: reposted,
      });
      try {
        const result = await setCommunityRepost(post.post_id, reposted);
        update(post.post_id, {
          repost_count: result.repost_count,
          reposted_by_me: result.reposted,
        });
        notify(result.reposted ? '피드에 공유했어요.' : '공유를 취소했어요.');
      } catch (error) {
        update(post.post_id, {
          repost_count: post.repost_count,
          reposted_by_me: post.reposted_by_me,
        });
        handleError(error, post.post_id, () => void toggleRepost(post));
      }
    });

  // Follow state lives on the screens; they apply the 'followed' event, optimistic first.
  const toggleFollow = (
    user: CommunityAuthor & { followed_by_me: boolean },
    followerCount?: number,
  ): Promise<void> =>
    once(`follow:${user.user_id}`, async () => {
      const following = !user.followed_by_me;
      const emit = (state: boolean, count?: number) =>
        emitCommunityEvent({
          followerCount: count,
          following: state,
          type: 'followed',
          userId: user.user_id,
        });
      emit(
        following,
        followerCount === undefined ? undefined : followerCount + (following ? 1 : -1),
      );
      try {
        const result = await setCommunityFollow(user.user_id, following);
        emit(result.following, result.follower_count);
      } catch (error) {
        emit(user.followed_by_me, followerCount);
        handleError(error, undefined, () => void toggleFollow(user, followerCount));
      }
    });

  // Reason first (sheet), then an optional detail (dialog), then the report.
  const openReport = (type: CommunityReportTarget, id: string, onDone: () => void) =>
    setSheet({
      options: COMMUNITY_REPORT_REASONS.map((reason) => ({
        label: reason.label,
        onPress: () => setReportDraft({ id, onDone, reason, type }),
      })),
      title: '신고 사유를 골라 주세요',
    });

  const submitReport = (
    draft: { type: CommunityReportTarget; id: string; onDone: () => void },
    reason: CommunityReportReason,
    detail: string | null,
  ) =>
    once(`report:${draft.id}`, async () => {
      try {
        await reportCommunityContent(draft.type, draft.id, reason, detail);
        draft.onDone();
        notify(
          draft.type === 'user'
            ? '신고가 접수됐어요. 운영자가 확인할게요.'
            : '신고가 접수됐어요. 이제 내 화면에서는 보이지 않아요.',
        );
      } catch (error) {
        handleError(error);
      }
    });

  const confirmBlock = (author: CommunityAuthor) =>
    setConfirm({
      confirmText: '차단',
      description: '서로의 글과 댓글이 보이지 않아요. 커뮤니티 설정에서 언제든 풀 수 있어요.',
      run: async () => {
        await setCommunityBlock(author.user_id, true);
        emitCommunityEvent({ type: 'blocked', userId: author.user_id });
        notify(`${author.nickname}님을 차단했어요.`);
      },
      title: `${author.nickname}님을 차단할까요?`,
    });

  const openPostMenu = (post: CommunityPost) =>
    setSheet({
      options: post.is_mine
        ? [
            {
              destructive: true,
              label: '삭제하기',
              onPress: () =>
                setConfirm({
                  confirmText: '삭제',
                  description: '사진, 댓글, 좋아요, 공유도 함께 지워지고 되돌릴 수 없어요.',
                  run: async () => {
                    await deleteCommunityPost(post.post_id);
                    emitCommunityEvent({ type: 'removed', postId: post.post_id });
                    notify('글을 삭제했어요.');
                  },
                  title: '글을 삭제할까요?',
                }),
            },
          ]
        : [
            {
              label: '신고하기',
              onPress: () =>
                openReport('post', post.post_id, () =>
                  emitCommunityEvent({ type: 'removed', postId: post.post_id }),
                ),
            },
            {
              destructive: true,
              label: `${post.author.nickname}님 차단하기`,
              onPress: () => confirmBlock(post.author),
            },
          ],
    });

  const openUserMenu = (author: CommunityAuthor) =>
    setSheet({
      options: [
        { label: '신고하기', onPress: () => openReport('user', author.user_id, () => undefined) },
        {
          destructive: true,
          label: `${author.nickname}님 차단하기`,
          onPress: () => confirmBlock(author),
        },
      ],
    });

  const openCommentMenu = (
    comment: CommunityComment,
    { onDeleted, onHidden }: { onDeleted: () => void; onHidden: () => void },
  ) => {
    const options: CommunityOption[] = [];
    if (comment.can_delete) {
      options.push({
        destructive: true,
        label: '댓글 삭제하기',
        onPress: () =>
          setConfirm({
            confirmText: '삭제',
            description: '삭제한 댓글은 되돌릴 수 없어요.',
            run: async () => {
              await deleteCommunityComment(comment.comment_id);
              onDeleted();
            },
            title: '댓글을 삭제할까요?',
          }),
      });
    }
    if (!comment.is_mine) {
      options.push(
        { label: '신고하기', onPress: () => openReport('comment', comment.comment_id, onHidden) },
        {
          destructive: true,
          label: `${comment.author.nickname}님 차단하기`,
          onPress: () => confirmBlock(comment.author),
        },
      );
    }
    if (options.length) setSheet({ options });
  };

  const elements = (
    <>
      <CommunityOptionsSheet
        onClose={() => setSheet(null)}
        options={sheet?.options ?? []}
        title={sheet?.title}
        visible={sheet !== null}
      />
      <AppDialog
        confirmText={confirm?.confirmText}
        description={confirm?.description}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          if (!current) return;
          void once('confirm', async () => {
            try {
              await current.run();
            } catch (error) {
              handleError(error);
            }
          });
        }}
        title={confirm?.title ?? ''}
        visible={confirm !== null}
      />
      <ReportDetailDialog
        onCancel={() => setReportDraft(null)}
        onSubmit={(detail) => {
          const draft = reportDraft;
          setReportDraft(null);
          if (draft) void submitReport(draft, draft.reason.value, detail);
        }}
        reasonLabel={reportDraft?.reason.label ?? ''}
        visible={reportDraft !== null}
      />
      <NicknameDialog
        onCancel={() => setNicknameRetry(null)}
        onSaved={() => {
          const retry = nicknameRetry;
          setNicknameRetry(null);
          notify('닉네임을 저장했어요.');
          retry?.();
        }}
        visible={nicknameRetry !== null}
      />
      {toast ? (
        <View
          pointerEvents="none"
          style={[styles.toast, shadows.floating, { top: insets.top + 12 }]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </>
  );

  // Screen-specific menus and confirmations (club owner tools, messages) share the same sheet.
  const openSheet = (options: CommunityOption[], title?: string) => setSheet({ options, title });
  const askConfirm = (next: Confirm) => setConfirm(next);

  return {
    askConfirm,
    elements,
    handleError,
    notify,
    openCommentMenu,
    openSheet,
    openPostMenu,
    openUserMenu,
    toggleFollow,
    toggleLike,
    toggleRepost,
  };
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.round,
    maxWidth: '90%',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    position: 'absolute',
    zIndex: 30,
  },
  toastText: { color: colors.surface, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
});
