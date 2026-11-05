import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import { useAppTheme } from '@/src/theme';

import { Text } from './Text';

// A text link followed by the app's caret icon, in the text's own color.
export function CaretText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors, easyMode } = useAppTheme();
  const color = StyleSheet.flatten(style)?.color ?? colors.textPrimary;
  const size = easyMode ? 20 : 16;
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 2 }}>
      <Text style={[{ flexShrink: 1 }, style]}>{children}</Text>
      <CaretRightIcon color={color as string} height={size} width={size} />
    </View>
  );
}
