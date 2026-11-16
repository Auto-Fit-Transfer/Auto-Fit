import { Pressable } from 'react-native';

import { aForm } from '@/src/components/a/form';
import { useThemedStyles, type AppTheme } from '@/src/theme';
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
  const a = aForm(colors);
  return {
    button: a.mini,
    follow: {},
    // Already following: flat and tinted, so it reads as a state and not as something to press next.
    following: { backgroundColor: colors.primaryLight, boxShadow: '0 0 0 rgba(32, 35, 63, 0.3)' },
    wide: { alignSelf: 'stretch', borderRadius: 12, height: 44 },
    pressed: { opacity: 0.75 },
    text: a.miniText,
    followText: {},
    followingText: {},
  } as const;
}
