import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import { fontFamilies } from '@/src/theme';

import { Text } from './Text';

export function ScreenHeader({ title, onBack, right }: { title?: string; onBack: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" hitSlop={12} onPress={onBack} style={styles.side}>
        <CaretLeftIcon color="#17161D" height={24} width={24} />
      </Pressable>
      {title ? <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text> : <View style={styles.spacer} />}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: '#FFFFFF', flexDirection: 'row', minHeight: 52, paddingHorizontal: 20 },
  side: { justifyContent: 'center', minHeight: 44, width: 44 },
  right: { alignItems: 'flex-end' },
  spacer: { flex: 1 },
  title: { color: '#17161D', flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24, textAlign: 'center' },
});
