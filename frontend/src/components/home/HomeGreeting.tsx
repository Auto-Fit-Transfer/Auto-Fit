import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

interface HomeGreetingProps {
  userName: string;
  message: string;
  style?: StyleProp<ViewStyle>;
}

export function HomeGreeting({ userName, message, style }: HomeGreetingProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.greeting}>
        안녕하세요, <Text style={styles.userName}>{userName}님</Text>
      </Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 11,
    width: 370,
  },
  greeting: {
    color: colors.textWhite,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 30,
    includeFontPadding: false,
    lineHeight: 36,
  },
  userName: {
    color: colors.primaryMedium,
  },
  message: {
    color: colors.textWhiteSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
  },
});
