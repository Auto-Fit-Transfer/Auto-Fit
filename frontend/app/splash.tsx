import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { 
  Dimensions,
  Image, 
  Platform,
  StyleSheet, 
  Text, 
  useWindowDimensions, 
  View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LogoIcon from '@/assets/icons/Logo_Auto-Fit.svg';
import { colors, fontFamilies, typography } from '@/src/theme';

const splashBackground = require('../assets/images/backgrounds/1_Splash.png');

const referenceWidth = 412;
const referenceHeight = 917;
const minimumContentScale = 0.78;
const splashDuration = 3000;

const referenceVisualTop = 297;
const referenceVisualBottom = 478;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/login');
    }, splashDuration);

    return () => clearTimeout(timer);
  }, [router]);

  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const widthScale = Math.min(1, availableWidth / referenceWidth);
  const contentScale = Math.max(minimumContentScale, widthScale);
  const screenHeight = Dimensions.get('screen').height;
  const responsiveHeight = Platform.OS === 'android' ? screenHeight : windowHeight;
  const scaledWidth = referenceWidth * contentScale;
  const scaledHeight = referenceHeight * contentScale;

  const safeTop = insets.top;
  const safeBottom = responsiveHeight - insets.bottom;
  const safeHeight = safeBottom - safeTop;

  const centeredTop = safeTop + (safeHeight - scaledHeight) / 2;
  const minimumTop = insets.top - referenceVisualTop * contentScale;
  const maximumTop = windowHeight - insets.bottom - referenceVisualBottom * contentScale;
  const canvasTop =
    minimumTop <= maximumTop ? clamp(centeredTop, minimumTop, maximumTop) : centeredTop;
  const canvasLeft = insets.left + (availableWidth - scaledWidth) / 2;

  return (
    <View style={styles.root}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={splashBackground}
        style={styles.background}
      />

      <View
        style={[
          styles.designCanvas,
          {
            left: canvasLeft,
            top: canvasTop,
            transform: [{ scale: contentScale }],
          },
        ]}
      >
        <View style={styles.splashContent}>
          <View style={styles.brand}>
            <LogoIcon accessibilityLabel="Auto-Fit 로고" height={68.479} width={71.591} />
            <Text style={styles.brandName}>Auto-Fit</Text>
          </View>

          <View style={styles.subtitle}>
            <Text numberOfLines={1} style={styles.subtitlePrimary}>
              내 몸에 딱 맞는 건강관리
            </Text>
            <Text numberOfLines={1} style={styles.subtitleAccent}>
              <Text style={styles.aiLabel}>AI</Text>가 함께하는 나만의 헬스케어
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  designCanvas: {
    height: referenceHeight,
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },
  splashContent: {
    alignItems: 'center',
    left: 0,
    paddingHorizontal: 81,
    paddingVertical: 28,
    position: 'absolute',
    top: 269,
    width: referenceWidth,
  },
  brand: {
    alignItems: 'center',
    gap: 6,
    width: 200,
  },
  brandName: {
    ...typography.display,
    color: colors.textBody,
    height: 50,
    includeFontPadding: false,
    textAlign: 'center',
    width: 200,
  },
  subtitle: {
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingVertical: 10,
    width: 200,
  },
  subtitlePrimary: {
    color: '#000000',
    fontFamily: fontFamilies.pretendardLight,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
    width: 252,
  },
  subtitleAccent: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardLight,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
    width: 252,
  },
  aiLabel: {
    fontFamily: fontFamilies.pretendardMedium,
  },
});
