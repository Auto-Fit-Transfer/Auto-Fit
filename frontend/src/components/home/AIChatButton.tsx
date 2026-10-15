import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import RobotIcon from '@/assets/figma/main/95215.svg';
import { colors, fontFamilies, radius } from '@/src/theme';

interface AIChatButtonProps {
  contentOffsetX?: Animated.AnimatedInterpolation<number> | number;
  onPress: () => void;
  snapSide?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}

export const AI_CHAT_BUTTON_SIZE = 55;

export function AIChatButton({ contentOffsetX, onPress, snapSide, style }: AIChatButtonProps) {
  const settledOffsetX = snapSide === 'left' ? 7.5 : snapSide === 'right' ? -7.5 : 0;
  const horizontalOffset = contentOffsetX ?? settledOffsetX;

  return (
    <Pressable
      accessibilityLabel="AI 채팅"
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Animated.View style={[styles.robotIcon, { transform: [{ translateX: horizontalOffset }] }]}>
        <RobotIcon />
      </Animated.View>
      <Animated.Text style={[styles.label, { transform: [{ translateX: horizontalOffset }] }]}>
        AI
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    elevation: Platform.OS === 'android' ? 3 : 0,
    height: AI_CHAT_BUTTON_SIZE,
    shadowColor: '#000000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    width: AI_CHAT_BUTTON_SIZE,
  },
  robotIcon: {
    height: 40,
    position: 'absolute',
    top: 4,
    width: 40,
  },
  label: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    includeFontPadding: false,
    letterSpacing: 1.2,
    lineHeight: 15,
    position: 'absolute',
    top: 36,
  },
  pressed: {
    opacity: 0.78,
  },
});
