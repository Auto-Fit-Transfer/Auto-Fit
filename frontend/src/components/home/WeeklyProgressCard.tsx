import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import TrendUpIcon from '@/assets/figma/main/97a4f.svg';
import CaretRight from '@/assets/figma/main/4be55.svg';
import { AppCard, Text } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

interface WeeklyProgressCardProps {
  change: number | null;
  message: string | null;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export function WeeklyProgressCard({ change, message, style, onPress }: WeeklyProgressCardProps) {
  const changeText = change === null ? '-' : `${change > 0 ? '+' : ''}${change}`;
  const comparisonResult =
    change === null
      ? '비교 데이터가 없어요!'
      : change === 0
        ? '변화 없어요!'
        : change > 0
          ? '상승했어요!'
          : '하락했어요!';
  const messageText = message ?? '-';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="건강 점수 변화 확인"
      onPress={onPress}
    >
      <AppCard
        accessibilityLabel={`${changeText}점 ${comparisonResult}`}
        padding="none"
        shadow
        style={[styles.card, style]}
      >
        <View style={styles.icon}>
          <TrendUpIcon />
        </View>
        <Text numberOfLines={1} style={styles.title}>
          이전 평가 대비 <Text style={styles.change}>{changeText}</Text>점 {comparisonResult}
        </Text>
        <Text numberOfLines={1} style={styles.message}>
          {messageText}
        </Text>
        <View style={{ position: 'absolute', right: 7, top: 23 }}>
          <CaretRight />
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 70,
    width: 300,
  },
  icon: {
    left: 10,
    position: 'absolute',
    top: 10,
  },
  title: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    includeFontPadding: false,
    left: 66,
    letterSpacing: 0.26,
    lineHeight: 17,
    position: 'absolute',
    right: 32,
    top: 14,
  },
  change: {
    color: colors.primary,
    letterSpacing: 0.26,
  },
  message: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    includeFontPadding: false,
    left: 66,
    lineHeight: 17,
    position: 'absolute',
    right: 32,
    top: 36,
  },
});
