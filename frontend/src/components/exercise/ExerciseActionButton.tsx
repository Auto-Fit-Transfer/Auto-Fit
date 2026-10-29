import { useId, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import ArrowRight from '@/assets/icons/common/ArrowRight.svg';
import { Text } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

interface ExerciseActionButtonProps {
  borderRadius?: number;
  gap?: number;
  hideTrailingArrow?: boolean;
  icon?: ReactNode;
  compact?: boolean;
  gradient?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary';
}

export function ExerciseActionButton({
  borderRadius,
  gap,
  hideTrailingArrow = false,
  icon,
  compact = false,
  gradient = false,
  labelStyle,
  maxFontSizeMultiplier,
  onPress,
  title,
  variant = 'primary',
}: ExerciseActionButtonProps) {
  const secondary = variant === 'secondary';
  const gradientId = `exercise-cta-gradient-${useId().replace(/:/g, '')}`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        borderRadius !== undefined && { borderRadius },
        gap !== undefined && { gap },
        compact && styles.compactButton,
        secondary && styles.secondary,
        pressed && styles.pressed,
      ]}
    >
      {!secondary && gradient ? (
        <Svg height="100%" pointerEvents="none" style={styles.gradient} width="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0" x2="1" y1="0.45" y2="0.55">
              <Stop offset="0" stopColor="#4DCC95" />
              <Stop offset="0.32" stopColor="#46C5A1" />
              <Stop offset="1" stopColor="#3EBFA4" />
            </LinearGradient>
          </Defs>
          <Rect fill={`url(#${gradientId})`} height="100%" rx={borderRadius ?? 50} width="100%" />
        </Svg>
      ) : null}
      <View pointerEvents="none" style={[styles.foreground, gap !== undefined && { gap }]}>
        {icon}
        <Text
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[
            styles.label,
            compact && styles.compactLabel,
            secondary && styles.secondaryLabel,
            labelStyle,
          ]}
        >
          {title}
        </Text>
        {!secondary && !icon && !hideTrailingArrow ? (
          <View style={styles.arrowCircle}>
            <ArrowRight color={colors.primary} fill={colors.primary} height={16} width={16} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  arrowCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primaryMedium,
    borderColor: colors.primaryMedium,
    borderRadius: 50,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 45,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compactButton: {
    height: 37,
    shadowColor: colors.primary,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  compactLabel: { fontSize: 17, letterSpacing: 0.85, lineHeight: 17 },
  foreground: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  gradient: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 0 },
  label: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 23,
  },
  pressed: { opacity: 0.82 },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: 10 },
  secondaryLabel: {
    color: colors.primary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 20,
  },
});
