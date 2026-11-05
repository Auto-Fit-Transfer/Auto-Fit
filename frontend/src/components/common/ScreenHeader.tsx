import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

export function ScreenHeader({ title, onBack, right }: { title?: string; onBack: () => void; right?: ReactNode }) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" hitSlop={12} onPress={onBack} style={styles.side}>
        <CaretLeftIcon color={colors.textPrimary} height={24} width={24} />
      </Pressable>
      {/* The easy mode's larger title sits beside the read aloud button, as in Figma. Otherwise it is centered on the screen whatever the right side holds. */}
      {title && easyMode ? <Text accessibilityRole="header" numberOfLines={1} style={styles.titleEasy}>{title}</Text> : null}
      <View style={styles.right}>{right}</View>
      {title && !easyMode ? (
        <View pointerEvents="none" style={[styles.titleLayer, { top: insets.top + 4 }]}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    header: { alignItems: 'center', backgroundColor: colors.background, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 20 },
    side: { justifyContent: 'center', minHeight: 44, width: 44 },
    right: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 44, minWidth: 44 },
    titleLayer: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 72, position: 'absolute', right: 72 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24, textAlign: 'center' },
    titleEasy: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  } as const;
}
