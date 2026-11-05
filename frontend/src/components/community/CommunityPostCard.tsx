import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import HeartIcon from '@/assets/icons/deco/Heart.svg';
import HeartFillIcon from '@/assets/icons/deco/Heart_Fill.svg';
import ChatIcon from '@/assets/icons/feature/ChatCircle.svg';
import RepeatIcon from '@/assets/icons/feature/Repeat.svg';
import MoreIcon from '@/assets/icons/system/DotsThreeOutline.svg';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import type { CommunityAuthor, CommunityPost, CommunityProfile } from '@/src/api/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { darkColors, fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { CommunityAvatar } from './CommunityAvatar';
import { CommunityFollowButton } from './CommunityFollowButton';
import { CommunityPostImages } from './CommunityPostImages';
import { Text } from '@/src/components/common';

export const COMMUNITY_POST_CATEGORY_LABELS = {
  workout: '운동 기록', routine: '루틴 공유', diet: '식단',
  question: '질문', review: '후기',
} as const;

export interface CommunityPostCardProps {
  post: CommunityPost;
  onPress?: () => void;
  onComment?: () => void;
  onLike: () => void;
  onRepost: () => void;
  onMore: () => void;
  onAuthorPress?: (author: CommunityAuthor) => void;
  expanded?: boolean;
  followProfile?: CommunityProfile | null;
  onFollow?: () => void;
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
  followProfile,
  onFollow,
}: CommunityPostCardProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const openAuthor = onAuthorPress ? () => onAuthorPress(post.author) : undefined;
  const postBody = (
    <>
      {post.content ? (
        <Text numberOfLines={expanded || simple ? undefined : 10} style={[styles.content, expanded && styles.detailContent, simple && simpleStyles.content, isDark && dark.text]}>
          {post.content}
        </Text>
      ) : null}
      {post.activity_snapshot ? <CommunityActivityCard snapshot={post.activity_snapshot} /> : null}
      <CommunityPostImages expanded={expanded} images={post.images} />
      {post.tags?.length ? <Text style={styles.tags}>{post.tags.map((tag) => `#${tag}`).join('  ')}</Text> : null}
      <View style={[styles.actions, expanded && styles.detailActions]}>
        <ActionButton active={post.liked_by_me} color={colors.danger} count={post.like_count}
          icon={post.liked_by_me ? <HeartFillIcon color={colors.danger} height={20} width={20} /> : <HeartIcon color={colors.textBody} height={20} width={20} />}
          label={post.liked_by_me ? '좋아요 취소' : '좋아요'} onPress={onLike} />
        <ActionButton count={post.comment_count} icon={<ChatIcon color={colors.textBody} height={20} width={20} />} label="댓글" onPress={onComment ?? onPress} />
        <View style={styles.actionsEnd}>
          <ActionButton active={post.reposted_by_me} color={colors.primaryPressed} end count={post.repost_count}
            icon={<RepeatIcon color={post.reposted_by_me ? colors.primaryPressed : colors.textBody} height={20} width={20} />}
            label={post.reposted_by_me ? '공유 취소' : '공유'} onPress={onRepost} />
        </View>
      </View>
    </>
  );
  return (
    // No button role on the card: it contains action buttons, and web forbids nested
    // <button>s. Screen-reader users open the post through the comment button instead.
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, simple && simpleStyles.card, expanded && styles.detailCard, pressed && styles.pressed, isDark && dark.card]}
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
          <CommunityAvatar author={post.author} size={36} />
        </Pressable>
        <View style={styles.body}>
          <Pressable disabled={!openAuthor} onPress={openAuthor} style={styles.nicknameButton}>
            <Text numberOfLines={1} style={[styles.nickname, simple && simpleStyles.nickname, isDark && dark.text]}>
              {post.author.nickname}
            </Text>
          </Pressable>
          <View style={styles.meta}>
            <Text style={styles.time}>{formatCommunityTime(post.created_at)}</Text>
            {post.category ? <Text style={styles.category}>{COMMUNITY_POST_CATEGORY_LABELS[post.category]}</Text> : null}
          </View>
        </View>
        {expanded && followProfile && !followProfile.is_me && onFollow ? (
          <CommunityFollowButton following={followProfile.followed_by_me} followsMe={followProfile.follows_me} nickname={followProfile.nickname} onPress={onFollow} />
        ) : null}
        <Pressable
          accessibilityLabel="더보기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onMore}
        >
          <MoreIcon color={colors.textBody} height={20} width={20} />
        </Pressable>
      </View>
      <View style={styles.detailBody}>{postBody}</View>
    </Pressable>
  );
}

function CommunityActivityCard({ snapshot }: { snapshot: Record<string, unknown> }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const name = typeof snapshot.name === 'string' ? snapshot.name : '공유한 운동';
  const minutes = typeof snapshot.duration_minutes === 'number' && Number.isFinite(snapshot.duration_minutes)
    ? `${Math.round(snapshot.duration_minutes)}분` : null;
  const calories = typeof snapshot.calories === 'number' && Number.isFinite(snapshot.calories)
    ? `${Math.round(snapshot.calories)}kcal` : null;
  const count = Array.isArray(snapshot.exercises) && snapshot.exercises.length ? `${snapshot.exercises.length}가지` : null;
  const meta = [minutes, count, calories].filter(Boolean).join(' · ');
  return (
    <View style={styles.activityCard}>
      <View style={styles.activityIcon}><BarbellIcon color={colors.textPrimary} height={20} width={20} /></View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityType}>운동 기록</Text>
        <Text numberOfLines={1} style={styles.activityName}>{name}</Text>
        {meta ? <Text style={styles.activityMeta}>{meta}</Text> : null}
      </View>
      <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
    </View>
  );
}

function ActionButton({
  active = false,
  end = false,
  color,
  count,
  icon,
  label,
  onPress,
}: {
  active?: boolean;
  end?: boolean;
  color?: string;
  count: number;
  icon: ReactNode;
  label: string;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={`${label} ${count}개`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onPress}
      style={[styles.action, end && styles.actionEnd]}
    >
      {icon}
      <Text style={[styles.count, active && color ? { color } : null]}>
        {count > 0 ? count.toLocaleString() : ''}
      </Text>
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    card: {
      backgroundColor: colors.background,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    detailCard: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 0 },
    detailBody: { gap: 12, paddingTop: 12 },
    detailContent: { marginTop: 0, lineHeight: 24 },
    detailActions: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
    pressed: { backgroundColor: colors.surface },
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
    row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    body: { flex: 1, gap: 2, minWidth: 0 },
    meta: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    nicknameButton: { flexShrink: 1 },
    nickname: {
      color: colors.textPrimary,
      flexShrink: 1,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 14,
      lineHeight: 21,
    },
    time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
    content: {
      color: colors.textPrimary,
      fontFamily: fontFamilies.pretendardRegular,
      fontSize: 16,
      lineHeight: 24,
    },
    category: { backgroundColor: colors.surfaceMuted, borderRadius: 6, color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1 },
    tags: { color: colors.textSecondary, fontSize: 14 },
    activityCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
    activityIcon: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
    activityCopy: { flex: 1, minWidth: 0 },
    activityType: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, lineHeight: 18 },
    activityName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    activityMeta: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    actions: { alignItems: 'center', flexDirection: 'row', gap: 16 },
    actionsEnd: { marginLeft: 'auto' },
    actionEnd: { justifyContent: 'flex-end' },
    action: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 28, minWidth: 44 },
    count: { color: colors.textBody, fontFamily: fontFamilies.pretendardRegular, fontSize: 14 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  card: { paddingHorizontal: 20, paddingVertical: 20 },
  nickname: {},
  content: {},
});

const dark = StyleSheet.create({
  card: { backgroundColor: darkColors.surface },
  text: { color: darkColors.textPrimary },
});
