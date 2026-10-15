import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import HeartIcon from '@/assets/icons/deco/Heart.svg';
import HeartFillIcon from '@/assets/icons/deco/Heart_Fill.svg';
import ChatIcon from '@/assets/icons/feature/ChatCircle.svg';
import RepeatIcon from '@/assets/icons/feature/Repeat.svg';
import MoreIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import type { CommunityAuthor, CommunityPost } from '@/src/api/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { colors, fontFamilies, spacing } from '@/src/theme';

import { CommunityAvatar } from './CommunityAvatar';
import { CommunityPostImages } from './CommunityPostImages';

export interface CommunityPostCardProps {
  post: CommunityPost;
  onPress?: () => void;
  onComment?: () => void;
  onLike: () => void;
  onRepost: () => void;
  onMore: () => void;
  onAuthorPress?: (author: CommunityAuthor) => void;
  expanded?: boolean;
}

export function CommunityPostCard({
  post,
  onPress,
  onComment,
  onLike,
  onRepost,
  onMore,
  onAuthorPress,
  expanded = false,
}: CommunityPostCardProps) {
  const openAuthor = onAuthorPress ? () => onAuthorPress(post.author) : undefined;
  return (
    // No button role on the card: it contains action buttons, and web forbids nested
    // <button>s. Screen-reader users open the post through the comment button instead.
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {post.reposted_by ? (
        <Pressable
          disabled={!onAuthorPress}
          hitSlop={4}
          onPress={() => post.reposted_by && onAuthorPress?.(post.reposted_by)}
          style={styles.repostHeader}
        >
          <RepeatIcon color={colors.textSecondary} height={14} width={14} />
          <Text numberOfLines={1} style={styles.repostText}>
            {post.reposted_by.nickname}님이 공유함
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityLabel={`${post.author.nickname}님 프로필`}
          accessibilityRole={openAuthor ? 'link' : undefined}
          disabled={!openAuthor}
          onPress={openAuthor}
        >
          <CommunityAvatar author={post.author} />
        </Pressable>
        <View style={styles.body}>
          <View style={styles.meta}>
            <Pressable disabled={!openAuthor} onPress={openAuthor} style={styles.nicknameButton}>
              <Text numberOfLines={1} style={styles.nickname}>
                {post.author.nickname}
              </Text>
            </Pressable>
            <Text style={styles.time}>· {formatCommunityTime(post.created_at)}</Text>
            <Pressable
              accessibilityLabel="더보기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onMore}
              style={styles.more}
            >
              <MoreIcon color={colors.textSecondary} height={20} width={20} />
            </Pressable>
          </View>
          {post.content ? (
            <Text numberOfLines={expanded ? undefined : 10} style={styles.content}>
              {post.content}
            </Text>
          ) : null}
          <CommunityPostImages images={post.images} />
          <View style={styles.actions}>
            <ActionButton
              count={post.comment_count}
              icon={<ChatIcon color={colors.textSecondary} height={19} width={19} />}
              label="댓글"
              onPress={onComment ?? onPress}
            />
            <ActionButton
              active={post.reposted_by_me}
              color={colors.primaryDark}
              count={post.repost_count}
              icon={
                <RepeatIcon
                  color={post.reposted_by_me ? colors.primaryDark : colors.textSecondary}
                  height={19}
                  width={19}
                />
              }
              label={post.reposted_by_me ? '공유 취소' : '공유'}
              onPress={onRepost}
            />
            <ActionButton
              active={post.liked_by_me}
              color={colors.danger}
              count={post.like_count}
              icon={
                post.liked_by_me ? (
                  <HeartFillIcon color={colors.danger} height={19} width={19} />
                ) : (
                  <HeartIcon color={colors.textSecondary} height={19} width={19} />
                )
              }
              label={post.liked_by_me ? '좋아요 취소' : '좋아요'}
              onPress={onLike}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ActionButton({
  active = false,
  color,
  count,
  icon,
  label,
  onPress,
}: {
  active?: boolean;
  color?: string;
  count: number;
  icon: ReactNode;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} ${count}개`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onPress}
      style={styles.action}
    >
      {icon}
      <Text style={[styles.count, active && color ? { color } : null]}>
        {count > 0 ? count.toLocaleString() : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.background },
  repostHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    paddingLeft: 30,
  },
  repostText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
  },
  row: { flexDirection: 'row', gap: 10 },
  body: { flex: 1, minWidth: 0 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  nicknameButton: { flexShrink: 1 },
  nickname: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
  },
  time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 13 },
  more: { marginLeft: 'auto' },
  content: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', gap: 36, marginTop: 10 },
  action: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 28, minWidth: 44 },
  count: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
});
