import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import HeartIcon from '@/assets/icons/deco/Heart.svg';
import HeartFillIcon from '@/assets/icons/deco/Heart_Fill.svg';
import ChatIcon from '@/assets/icons/feature/ChatCircle.svg';
import RepeatIcon from '@/assets/icons/feature/Repeat.svg';
import MoreIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import type { CommunityAuthor, CommunityPost, CommunityProfile } from '@/src/api/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { colors, darkColors, fontFamilies, spacing } from '@/src/theme';

import { CommunityAvatar } from './CommunityAvatar';
import { CommunityFollowButton } from './CommunityFollowButton';
import { CommunityPostImages } from './CommunityPostImages';

const CATEGORY_LABELS = {
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
  const { preferences, isDark } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const openAuthor = onAuthorPress ? () => onAuthorPress(post.author) : undefined;
  const postBody = (
    <>
      {post.category ? <Text style={styles.category}>{CATEGORY_LABELS[post.category]}</Text> : null}
      {post.content ? (
        <Text numberOfLines={expanded || simple ? undefined : 10} style={[styles.content, expanded && styles.detailContent, simple && simpleStyles.content, isDark && dark.text]}>
          {post.content}
        </Text>
      ) : null}
      <CommunityPostImages expanded={expanded} images={post.images} />
      {post.activity_snapshot ? <CommunityActivityCard snapshot={post.activity_snapshot} /> : null}
      {post.tags?.length ? <Text style={styles.tags}>{post.tags.map((tag) => `#${tag}`).join('  ')}</Text> : null}
      <View style={[styles.actions, expanded && styles.detailActions]}>
        {expanded ? (
          <>
            <ActionButton active={post.liked_by_me} color={colors.danger} count={post.like_count}
              icon={post.liked_by_me ? <HeartFillIcon color={colors.danger} height={19} width={19} /> : <HeartIcon color={colors.textSecondary} height={19} width={19} />}
              label={post.liked_by_me ? '좋아요 취소' : '좋아요'} onPress={onLike} />
            <ActionButton count={post.comment_count} icon={<ChatIcon color={colors.textSecondary} height={19} width={19} />} label="댓글" onPress={onComment ?? onPress} />
            <ActionButton active={post.reposted_by_me} color={colors.primaryDark} count={post.repost_count}
              icon={<RepeatIcon color={post.reposted_by_me ? colors.primaryDark : colors.textSecondary} height={19} width={19} />}
              label={post.reposted_by_me ? '공유 취소' : '공유'} onPress={onRepost} />
          </>
        ) : (
          <>
            <ActionButton count={post.comment_count} icon={<ChatIcon color={colors.textSecondary} height={19} width={19} />} label="댓글" onPress={onComment ?? onPress} />
            <ActionButton active={post.reposted_by_me} color={colors.primaryDark} count={post.repost_count}
              icon={<RepeatIcon color={post.reposted_by_me ? colors.primaryDark : colors.textSecondary} height={19} width={19} />}
              label={post.reposted_by_me ? '공유 취소' : '공유'} onPress={onRepost} />
            <ActionButton active={post.liked_by_me} color={colors.danger} count={post.like_count}
              icon={post.liked_by_me ? <HeartFillIcon color={colors.danger} height={19} width={19} /> : <HeartIcon color={colors.textSecondary} height={19} width={19} />}
              label={post.liked_by_me ? '좋아요 취소' : '좋아요'} onPress={onLike} />
          </>
        )}
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
          <CommunityAvatar author={post.author} />
        </Pressable>
        <View style={styles.body}>
          <View style={styles.meta}>
            <Pressable disabled={!openAuthor} onPress={openAuthor} style={styles.nicknameButton}>
              <Text numberOfLines={1} style={[styles.nickname, simple && simpleStyles.nickname, isDark && dark.text]}>
                {post.author.nickname}
              </Text>
            </Pressable>
            <Text style={styles.time}>· {formatCommunityTime(post.created_at)}</Text>
            {expanded && followProfile && !followProfile.is_me && onFollow ? (
              <CommunityFollowButton following={followProfile.followed_by_me} followsMe={followProfile.follows_me} nickname={followProfile.nickname} onPress={onFollow} />
            ) : null}
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
          {expanded ? null : postBody}
        </View>
      </View>
      {expanded ? <View style={styles.detailBody}>{postBody}</View> : null}
    </Pressable>
  );
}

function CommunityActivityCard({ snapshot }: { snapshot: Record<string, unknown> }) {
  const name = typeof snapshot.name === 'string' ? snapshot.name : '공유한 운동';
  const minutes = typeof snapshot.duration_minutes === 'number' && Number.isFinite(snapshot.duration_minutes)
    ? `${Math.round(snapshot.duration_minutes)}분` : null;
  const calories = typeof snapshot.calories === 'number' && Number.isFinite(snapshot.calories)
    ? `약 ${Math.round(snapshot.calories)}kcal` : null;
  const exercises = Array.isArray(snapshot.exercises)
    ? snapshot.exercises.filter((item): item is string => typeof item === 'string').slice(0, 3) : [];
  return (
    <View style={styles.activityCard}>
      <Text style={styles.activityType}>운동 기록</Text>
      <Text numberOfLines={1} style={styles.activityName}>{name}</Text>
      {minutes || calories ? <Text style={styles.activityMeta}>{[minutes, calories].filter(Boolean).join(' · ')}</Text> : null}
      {exercises.map((item, index) => <Text key={`${index}-${item}`} numberOfLines={1} style={styles.activityExercise}>{index + 1}  {item}</Text>)}
    </View>
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
  detailCard: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 0 },
  detailBody: { gap: spacing.md, paddingTop: spacing.md },
  detailContent: { marginTop: 0, lineHeight: 24 },
  detailActions: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between', gap: 0, paddingVertical: spacing.sm },
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
  category: { color: colors.textSecondary, fontSize: 11, marginTop: 4, marginBottom: 3 },
  tags: { color: colors.textSecondary, fontSize: 12, marginTop: 9 },
  activityCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 10, gap: 5, backgroundColor: colors.background },
  activityType: { color: colors.textSecondary, fontSize: 11 },
  activityName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  activityMeta: { color: colors.textSecondary, fontSize: 11 },
  activityExercise: { color: colors.textPrimary, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 36, marginTop: 10 },
  action: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 28, minWidth: 44 },
  count: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
});

const simpleStyles = StyleSheet.create({
  card: { paddingHorizontal: 20, paddingVertical: 20 },
  nickname: { fontSize: 18 },
  content: { fontSize: 18, lineHeight: 27, marginTop: 8 },
});

const dark = StyleSheet.create({
  card: { backgroundColor: darkColors.surface, borderBottomColor: darkColors.border },
  text: { color: darkColors.textPrimary },
});
