import { Pressable, StyleSheet, View } from 'react-native';
import RetryIcon from '@/assets/icons/system/ArrowsClockwise.svg';
import { fontFamilies } from '@/src/theme';
import { Text } from './Text';

type Props = {
  message?: string;
  offline?: boolean;
  onRetry: () => void;
  preservesInput?: boolean;
};

export function R6ConnectionError({ message, offline = false, onRetry, preservesInput = false }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.icon}><RetryIcon color="#17161D" height={28} width={28} /></View>
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

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
  icon: { alignItems: 'center', backgroundColor: '#F2F4F6', borderRadius: 32, height: 64, justifyContent: 'center', marginBottom: 16, width: 64 },
  title: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
  description: { color: '#3B3A42', fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21, marginTop: 4, textAlign: 'center' },
  retry: { alignItems: 'center', backgroundColor: '#F2F4F6', borderRadius: 8, height: 40, justifyContent: 'center', marginTop: 16, paddingHorizontal: 16 },
  retryText: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
});
