import { View } from 'react-native';

import LogoIcon from '@/assets/icons/Logo_Auto-Fit.svg';
import { typography, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

export function SignUpBrand() {
  const styles = useThemedStyles(createStyles);
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

function createStyles({ colors }: AppTheme) {
  return {
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
      color: colors.primaryPressed,
      lineHeight: 17,
    },
  } as const;
}
