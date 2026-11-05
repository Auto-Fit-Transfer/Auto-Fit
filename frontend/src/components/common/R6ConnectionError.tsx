import { Pressable, View } from 'react-native';
import RetryIcon from '@/assets/icons/system/ArrowsClockwise.svg';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from './Text';

type Props = {
  message?: string;
  offline?: boolean;
  onRetry: () => void;
  preservesInput?: boolean;
};

export function R6ConnectionError({ message, offline = false, onRetry, preservesInput = false }: Props) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <View style={styles.icon}><RetryIcon color={colors.textPrimary} height={28} width={28} /></View>
      <Text accessibilityRole="header" style={styles.title}>
        {offline ? '연결이 끊겼어요' : '불러오지 못했어요'}
      </Text>
      <Text style={styles.description}>
        {offline ? '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' : (message ?? '잠시 후 다시 시도해 주세요.')}
        {preservesInput ? '\n입력한 내용은 그대로 남아 있어요.' : ''}
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
    icon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 32, height: 64, justifyContent: 'center', marginBottom: 16, width: 64 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    description: { color: colors.textBody, fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21, marginTop: 4, textAlign: 'center' },
    retry: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 8, height: 40, justifyContent: 'center', marginTop: 16, paddingHorizontal: 16 },
    retryText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  } as const;
}
