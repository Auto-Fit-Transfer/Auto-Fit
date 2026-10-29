import { Pressable, StyleSheet, View } from 'react-native';

import MoreIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import type { CommunityAuthor, CommunityComment } from '@/src/api/community';
import { Text } from '@/src/components/common';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { CommunityAvatar } from './CommunityAvatar';

export function CommunityCommentRow({
  comment,
  onMore,
  onAuthorPress,
}: {
  comment: CommunityComment;
  onMore: () => void;
  onAuthorPress?: (author: CommunityAuthor) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const hasMenu = comment.can_delete || !comment.is_mine;
  const openAuthor = onAuthorPress ? () => onAuthorPress(comment.author) : undefined;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`${comment.author.nickname}님 프로필`}
        accessibilityRole={openAuthor ? 'link' : undefined}
        disabled={!openAuthor}
        onPress={openAuthor}
      >
        <CommunityAvatar author={comment.author} size={34} />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.meta}>
          <Pressable disabled={!openAuthor} onPress={openAuthor} style={styles.nicknameButton}>
            <Text numberOfLines={1} style={styles.nickname}>
              {comment.author.nickname}
            </Text>
          </Pressable>
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

function createStyles({ colors }: AppTheme) {
  return {
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
    nicknameButton: { flexShrink: 1 },
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
  } as const;
}
