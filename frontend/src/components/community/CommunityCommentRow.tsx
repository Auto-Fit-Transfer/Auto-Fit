import { Pressable, StyleSheet, Text, View } from 'react-native';

import MoreIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import type { CommunityComment } from '@/src/api/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { colors, fontFamilies, spacing } from '@/src/theme';

import { CommunityAvatar } from './CommunityAvatar';

export function CommunityCommentRow({
  comment,
  onMore,
}: {
  comment: CommunityComment;
  onMore: () => void;
}) {
  const hasMenu = comment.can_delete || !comment.is_mine;
  return (
    <View style={styles.row}>
      <CommunityAvatar author={comment.author} size={34} />
      <View style={styles.body}>
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.nickname}>
            {comment.author.nickname}
          </Text>
          <Text style={styles.time}>· {formatCommunityTime(comment.created_at)}</Text>
          {hasMenu ? (
            <Pressable
              accessibilityLabel="댓글 더보기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onMore}
              style={styles.more}
            >
              <MoreIcon color={colors.textSecondary} height={18} width={18} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.content}>{comment.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  body: { flex: 1, minWidth: 0 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  nickname: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
  },
  time: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12 },
  more: { marginLeft: 'auto' },
  content: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 2,
  },
});
