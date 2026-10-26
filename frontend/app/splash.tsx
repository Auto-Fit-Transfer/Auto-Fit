import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import SplashBrand from '@/assets/icons/splash-redesign/844fc.svg';
import { colors, fontFamilies } from '@/src/theme';

const splashDuration = 3000;

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/login'), splashDuration);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <LinearGradient id="splash-background" x1="0%" x2="100%" y1="0%" y2="0%">
            <Stop offset="0" stopColor={colors.dark} />
            <Stop offset="1" stopColor="#30363A" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#splash-background)" height="100%" width="100%" />
      </Svg>

      <View style={styles.content}>
        <SplashBrand accessibilityLabel="Auto-Fit 로고" />
        <View style={styles.message}>
          <Text style={styles.promise}>내 몸에 딱 맞는 건강관리</Text>
          <Text style={styles.companion}>
            <Text style={styles.ai}>AI</Text>가 함께하는 나만의 헬스케어
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.dark,
    flex: 1,
    justifyContent: 'center',
    maxWidth: 412,
    paddingBottom: 24,
    paddingHorizontal: 32,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    gap: 25,
    maxWidth: 348,
    width: '100%',
  },
  message: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  promise: {
    color: colors.textWhite,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
  },
  companion: {
    color: colors.textWhiteSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  ai: { color: colors.primaryMedium },
});
