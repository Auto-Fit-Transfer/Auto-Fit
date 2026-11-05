import { Pressable } from 'react-native';

import { fontFamilies, spacing, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

export interface CommunityFollowButtonProps {
  following: boolean;
  followsMe?: boolean;
  nickname: string;
  onPress: () => void;
  wide?: boolean;
}

export function CommunityFollowButton({
  following,
  followsMe = false,
  nickname,
  onPress,
  wide = false,
}: CommunityFollowButtonProps) {
  const styles = useThemedStyles(createStyles);
  const label = following ? '팔로잉' : followsMe ? '맞팔로우' : '팔로우';
  return (
    <Pressable
      accessibilityLabel={following ? `${nickname}님 팔로우 취소` : `${nickname}님 팔로우`}
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        following ? styles.following : styles.follow,
        wide && styles.wide,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.text, following ? styles.followingText : styles.followText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    button: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 34,
      paddingHorizontal: spacing.md,
    },
    follow: { backgroundColor: colors.background, borderColor: colors.border },
    following: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
    wide: { alignSelf: 'stretch', borderRadius: 12, minHeight: 44 },
    pressed: { opacity: 0.75 },
    text: { fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    followText: { color: colors.textPrimary },
    followingText: { color: colors.textPrimary },
  } as const;
}
