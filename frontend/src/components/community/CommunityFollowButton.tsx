import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/src/components/common';
import { colors, fontFamilies, radius, spacing } from '@/src/theme';

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

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.round,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.lg,
  },
  follow: { backgroundColor: colors.primary, borderColor: colors.primary },
  following: { backgroundColor: colors.surface, borderColor: colors.border },
  wide: { alignSelf: 'stretch', minHeight: 42 },
  pressed: { opacity: 0.75 },
  text: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  followText: { color: colors.surface },
  followingText: { color: colors.textPrimary },
});
