import { Pressable, View } from 'react-native';

import MoreIcon from '@/assets/icons/system/DotsThree.svg';
import type { CommunityAuthor, CommunityComment } from '@/src/api/community';
import { formatCommunityTime } from '@/src/features/community/communityEvents';
import { aForm } from '@/src/components/a/form';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { CommunityAvatar } from './CommunityAvatar';
import { Text } from '@/src/components/common';

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
  const a = aForm(colors);
  return {
    row: {
      borderBottomColor: colors.track,
      borderBottomWidth: 2,
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: 16,
      paddingVertical: 14,
    },
    body: { flex: 1, minWidth: 0 },
    meta: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    nicknameButton: { flexShrink: 1 },
    nickname: { ...a.p15, color: colors.ink, flexShrink: 1 },
    time: a.note,
    more: { marginLeft: 'auto' },
    content: { ...a.p15, color: colors.ink, marginTop: 2 },
  } as const;
}
