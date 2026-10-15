import type { ReactNode } from 'react';
import {
  Image,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LogoIcon from '@/assets/icons/Logo_Auto-Fit.svg';
import { BackButton } from '@/src/components/common';
import { colors, typography } from '@/src/theme';

const authBackground = require('../../../assets/images/backgrounds/2_Auth.png');
const referenceContentHeight = 815;
const referenceWidth = 412;
const referenceBackTop = 67;
const minimumScreenHeight = 740;
const maximumScreenHeight = 917;

export interface PasswordAuthScreenLayoutProps {
  title: string;
  description: ReactNode;
  onBack: () => void;
  children: ReactNode;
}

export interface PasswordAuthSectionProps {
  top: number;
  children: ReactNode;
  innerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

export function PasswordAuthSection({
  top,
  children,
  innerStyle,
  style,
}: PasswordAuthSectionProps) {
  return (
    <View style={[styles.section, { top }, style]}>
      <View style={[styles.sectionInner, innerStyle]}>{children}</View>
    </View>
  );
}

export function PasswordAuthScreenLayout({
  title,
  description,
  onBack,
  children,
}: PasswordAuthScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const topSafetyOffset = Math.max(0, insets.top - referenceBackTop);
  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const widthScale = Math.min(1, availableWidth / referenceWidth);
  const scaledWidth = referenceWidth * widthScale;
  const canvasLeft = insets.left + (availableWidth - scaledWidth) / 2;
  const screenHeight = Dimensions.get('screen').height;
  const responsiveHeight = Platform.OS === 'android' ? screenHeight : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(1, (responsiveHeight - minimumScreenHeight) / (maximumScreenHeight - minimumScreenHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;

  return (
    <View style={styles.root}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={authBackground}
        style={styles.background}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <Pressable accessible={false} onPress={Keyboard.dismiss} style={styles.dismissArea}>
          <View style={styles.viewport}>
            <View
              style={[
                styles.contentUnit,
                {
                  left: canvasLeft,
                  top: topSafetyOffset,
                  transform: [{ scale: widthScale }],
                },
              ]}
            >
                <View style={styles.backButton}>
                  <BackButton onPress={onBack} size={44} />
                </View>
                <View style={[styles.brand, { top: verticalValue(69, 54) }]}>
                  <LogoIcon accessibilityLabel="Auto-Fit 로고" height={62} width={65} />
                  <Text style={styles.title}>{title}</Text>
                  <Text style={styles.description}>{description}</Text>
                </View>
                {children}
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    width: '100%',
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
  keyboardAvoidingView: {
    flex: 1,
    width: '100%',
  },
  dismissArea: {
    flex: 1,
    width: '100%',
  },
  viewport: {
    alignItems: 'center',
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  contentUnit: {
    height: referenceContentHeight,
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },
  backButton: {
    left: 0,
    position: 'absolute',
    top: 57.5,
    zIndex: 2,
  },
  brand: {
    alignItems: 'center',
    gap: 5,
    height: 200,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 31,
    position: 'absolute',
    right: 0,
    top: 69,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    height: 50,
    includeFontPadding: false,
    lineHeight: 40,
    maxWidth: 350,
    textAlign: 'center',
    width: '100%',
  },
  description: {
    ...typography.body,
    color: colors.textBody,
    flexShrink: 1,
    includeFontPadding: false,
    lineHeight: 22,
    maxWidth: 300,
    textAlign: 'center',
    width: '100%',
  },
  section: {
    alignItems: 'center',
    left: 0,
    paddingHorizontal: 31,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: 0,
  },
  sectionInner: {
    maxWidth: 350,
    width: '100%',
  },
});
