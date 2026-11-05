import { View, type StyleProp, type ViewStyle } from 'react-native';

import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

interface HomeGreetingProps {
  userName: string;
  message: string;
  style?: StyleProp<ViewStyle>;
}

export function HomeGreeting({ userName, message, style }: HomeGreetingProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.greeting}>
        안녕하세요, <Text style={styles.userName}>{userName}님</Text>
      </Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    container: {
      gap: 11,
      width: 370,
    },
    greeting: {
      color: colors.onPrimary,
      fontFamily: fontFamilies.pretendardBold,
      fontSize: 32,
      includeFontPadding: false,
      lineHeight: 40,
    },
    userName: {
      color: colors.primary,
    },
    message: {
      color: colors.textDisabled,
      fontFamily: fontFamilies.pretendardMedium,
      fontSize: 16,
      includeFontPadding: false,
      lineHeight: 24,
    },
  } as const;
}
