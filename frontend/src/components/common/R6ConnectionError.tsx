import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fontFamilies } from '@/src/theme';

type Props = {
  message?: string;
  offline?: boolean;
  onRetry: () => void;
  preservesInput?: boolean;
};

export function R6ConnectionError({ message, offline = false, onRetry, preservesInput = false }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.icon}><Text style={styles.iconText}>⟳</Text></View>
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
  icon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F4F4F7', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconText: { color: '#32313A', fontSize: 29 },
  title: { color: '#25242C', fontFamily: fontFamilies.pretendardBold, fontSize: 19 },
  description: { color: '#777681', fontFamily: fontFamilies.pretendardRegular, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 9 },
  retry: { marginTop: 20, borderRadius: 8, backgroundColor: '#F4F4F6', paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#33323A', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
});
