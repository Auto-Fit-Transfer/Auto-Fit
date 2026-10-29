import { StyleSheet, View } from 'react-native';

import LogoIcon from '@/assets/icons/Logo_Auto-Fit.svg';
import { Text } from '@/src/components/common';
import { colors, typography } from '@/src/theme';

export function SignUpBrand() {
  return (
    <View style={styles.container}>
      <LogoIcon accessibilityLabel="Auto-Fit 로고" height={62} width={65} />
      <Text style={styles.title}>회원가입</Text>
      <Text style={styles.subtitle}>
        건강한 변화를 위한 <Text style={styles.accent}>첫걸음</Text>, 함께 시작해요!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    height: 167,
    paddingTop: 10,
    width: '100%',
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    height: 50,
    includeFontPadding: false,
    lineHeight: 40,
    marginTop: 5,
    textAlign: 'center',
    width: 200,
  },
  subtitle: {
    ...typography.body,
    color: colors.textBody,
    height: 17,
    includeFontPadding: false,
    lineHeight: 17,
    textAlign: 'center',
    width: 252,
  },
  accent: {
    ...typography.bodyEmphasis,
    color: colors.primaryDark,
    lineHeight: 17,
  },
});
