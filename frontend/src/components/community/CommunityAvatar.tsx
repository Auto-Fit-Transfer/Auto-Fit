import { Image, View } from 'react-native';

import type { CommunityAuthor } from '@/src/api/community';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

export function CommunityAvatar({ author, size = 44 }: { author: CommunityAuthor; size?: number }) {
  const styles = useThemedStyles(createStyles);
  // renewal B: a round face, the first letter of the name on light grey
  const frame = { borderRadius: size / 2, height: size, width: size };
  if (author.profile_image_url) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: author.profile_image_url }}
        style={[styles.image, frame]}
      />
    );
  }
  return (
    <View style={[styles.fallback, frame]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
        {Array.from(author.nickname.trim())[0] ?? '회'}
      </Text>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    fallback: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      justifyContent: 'center',
    },
    image: { backgroundColor: colors.surfaceMuted },
    initial: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold },
  } as const;
}
