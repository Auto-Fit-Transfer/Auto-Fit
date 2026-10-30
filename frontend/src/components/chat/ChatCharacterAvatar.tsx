import { Image, StyleSheet, View } from 'react-native';

import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';

export type ChatAvatarVariant = 0 | 1 | 2;

const portraits = {
  quni: require('@/assets/images/chat/quni.png'),
  nabi: require('@/assets/images/chat/nabi.png'),
  coach: require('@/assets/images/chat/coach.png'),
} as const;

type Props = {
  characterId: ChatCharacterId;
  size: number;
  variant?: ChatAvatarVariant;
};

export function getChatAvatarVariant(message: { isWelcome?: boolean; needsMoreData?: boolean }): ChatAvatarVariant {
  if (message.isWelcome) return 1;
  if (message.needsMoreData) return 0;
  return 2;
}

export function ChatCharacterAvatar({ characterId, size, variant = 0 }: Props) {
  return (
    <View accessible={false} style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        resizeMode="stretch"
        source={portraits[characterId]}
        style={{ position: 'absolute', top: 0, left: -variant * size, width: size * 3, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#E9E8E8' },
});
