import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { AppCard } from '@/src/components/common';
import { colors, fontFamilies, radius } from '@/src/theme';

interface HealthUploadOptionCardProps {
  buttonLabel: string;
  description: string[];
  disabled: boolean;
  Icon: ComponentType<SvgProps>;
  onPress: () => void;
  secondary?: boolean;
  style?: StyleProp<ViewStyle>;
  title: string;
}

export function HealthUploadOptionCard({
  buttonLabel,
  description,
  disabled,
  Icon,
  onPress,
  secondary = false,
  style,
  title,
}: HealthUploadOptionCardProps) {
  return (
    <AppCard bordered padding="none" style={[styles.card, style]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Icon />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description.join(' ')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: disabled, disabled }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            secondary && styles.secondaryButton,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonLabel, secondary && styles.secondaryButtonLabel]}>
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    height: 220,
    width: 180,
  },
  content: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 10,
    width: '100%',
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  title: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 20,
  },
  description: {
    alignSelf: 'stretch',
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 15,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: radius.xl,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    maxWidth: 160,
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
  },
  buttonLabel: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    includeFontPadding: false,
    lineHeight: 16,
  },
  secondaryButtonLabel: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
