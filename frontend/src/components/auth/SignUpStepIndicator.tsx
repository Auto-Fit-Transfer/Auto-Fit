import { StyleSheet, View } from 'react-native';

import CheckIcon from '@/assets/icons/system/Check.svg';
import { Text } from '@/src/components/common';
import { colors, radius, typography } from '@/src/theme';

export interface SignUpStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  totalSteps?: 3 | 4;
}

export function SignUpStepIndicator({
  currentStep,
  totalSteps = 4,
}: SignUpStepIndicatorProps) {
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1);

  return (
    <View accessibilityLabel={`회원가입 ${currentStep}단계 중 ${totalSteps}단계`} style={styles.container}>
      {steps.map((step, index) => {
        const completed = step < currentStep;
        const active = step === currentStep;

        return (
          <View key={step} style={styles.itemGroup}>
            {index > 0 ? <View style={styles.line} /> : null}
            <View style={[styles.step, completed && styles.completed, active && styles.active]}>
              {completed ? (
                <CheckIcon color={colors.primaryDark} height={15} width={15} />
              ) : (
                <Text style={[styles.stepLabel, active && styles.activeLabel]}>{step}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 20,
    justifyContent: 'center',
  },
  itemGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  line: {
    backgroundColor: colors.textDisabled,
    height: StyleSheet.hairlineWidth,
    marginLeft: 3,
    width: 37.6,
  },
  step: {
    alignItems: 'center',
    borderColor: colors.textDisabled,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 17,
    justifyContent: 'center',
    width: 17,
  },
  completed: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  active: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textDisabled,
    fontSize: 9,
    includeFontPadding: false,
    lineHeight: 11,
    textAlign: 'center',
  },
  activeLabel: {
    color: colors.surface,
  },
});
