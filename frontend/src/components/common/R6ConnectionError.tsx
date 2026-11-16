import { Pressable, View } from 'react-native';

import { ALoading } from '@/src/components/a/ALoading';
import { aForm } from '@/src/components/a/form';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

import { Text } from './Text';

type Props = {
  message?: string;
  offline?: boolean;
  onRetry: () => void;
  preservesInput?: boolean;
};

// Renewal A: a lost connection is the loading look with why and a way to try again under it (the app
// is still trying to get there); anything else that failed is said plainly, without the turning ring.
export function R6ConnectionError({ message, offline = false, onRetry, preservesInput = false }: Props) {
  const styles = useThemedStyles(createStyles);
  const words = (
    <View style={styles.lost}>
      <Text accessibilityRole="header" style={offline ? styles.body : styles.title}>
        {offline ? '연결이 끊겼어요' : '불러오지 못했어요'}
      </Text>
      {offline && !preservesInput ? null : (
        <Text style={styles.description}>
          {offline ? '' : (message ?? '잠시 후 다시 시도해 주세요.')}
          {preservesInput ? `${offline ? '' : '\n'}입력한 내용은 그대로 남아 있어요.` : ''}
        </Text>
      )}
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
  return offline ? <ALoading label="연결이 끊겼어요">{words}</ALoading> : <View style={styles.root}>{words}</View>;
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
    lost: { alignItems: 'center', gap: 8 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    body: { ...a.p15, color: colors.ink },
    description: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    retry: { ...a.go, ...a.goGhost, height: 46, marginTop: 6, paddingHorizontal: 18 },
    pressed: a.goPressed,
    retryText: { ...a.p15, color: colors.ink },
  } as const;
}
