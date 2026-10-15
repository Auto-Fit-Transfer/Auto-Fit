import type { ReactNode } from 'react';
import {
  Image,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, BackButton } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

import { SignUpBrand } from './SignUpBrand';
import { SignUpStepIndicator } from './SignUpStepIndicator';

const authBackground = require('../../../assets/images/backgrounds/2_Auth.png');
const referenceContentHeight = 815;
const referenceWidth = 412;
const referenceBackTop = 67;
const minimumScreenHeight = 740;
const maximumScreenHeight = 917;

export interface SignUpScreenLayoutProps {
  currentStep: 1 | 2 | 3 | 4;
  totalSteps?: 3 | 4;
  ctaLabel: string;
  onBack: () => void;
  onContinue: () => void;
  children: ReactNode;
  contentOffsetY?: number;
  ctaTop?: number;
  alignStepCta?: boolean;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
}

export interface SignUpSectionProps {
  top: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}

export function SignUpSection({ top, children, style, innerStyle }: SignUpSectionProps) {
  return (
    <View style={[styles.section, { top }, style]}>
      <View style={[styles.sectionInner, innerStyle]}>{children}</View>
    </View>
  );
}

export function SignUpScreenLayout({
  currentStep,
  totalSteps = 4,
  ctaLabel,
  onBack,
  onContinue,
  children,
  contentOffsetY = 0,
  ctaTop,
  alignStepCta = false,
  ctaDisabled = false,
  ctaLoading = false,
}: SignUpScreenLayoutProps) {
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
    Math.min(
      1,
      (responsiveHeight - minimumScreenHeight) / (maximumScreenHeight - minimumScreenHeight),
    ),
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
                  top: topSafetyOffset - contentOffsetY,
                  transform: [{ scale: widthScale }],
                },
              ]}
            >
              <View style={styles.backButton}>
                <BackButton onPress={onBack} size={44} />
              </View>
              <View style={[styles.stepIndicator, { top: verticalValue(70, 55) }]}>
                <SignUpStepIndicator currentStep={currentStep} totalSteps={totalSteps} />
              </View>
              <View style={[styles.brand, { top: verticalValue(96, 74) }]}>
                <SignUpBrand />
              </View>
              {children}
              <SignUpSection top={ctaTop ?? verticalValue(760, alignStepCta ? 696 : 660)}>
                <AppButton
                  disabled={ctaDisabled}
                  labelStyle={alignStepCta ? styles.stepCtaLabel : undefined}
                  loading={ctaLoading}
                  onPress={onContinue}
                  title={ctaLabel}
                />
              </SignUpSection>
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
  stepIndicator: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 70,
  },
  brand: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 96,
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
  stepCtaLabel: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 20,
    lineHeight: 24,
  },
});
