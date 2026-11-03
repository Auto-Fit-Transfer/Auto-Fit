import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Chevron from '@/assets/figma/main/e010e.svg';
import { MainScreen } from '@/src/components/main/MainSurface';
import { colors, fontFamilies } from '@/src/theme';
import { Text } from '@/src/components/common';

export default function StartMoveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const open = (path: '/diet' | '/exercise' | '/home') => {
    router.dismissAll();
    router.replace(path);
  };
  return (
    <MainScreen tabs={false}>
      <StatusBar style="dark" />
      <View style={[s.head, { paddingTop: insets.top + 40 }]}>
        <Text style={s.label}>종합 건강 분석</Text>
        <Text style={s.headline}>나에게 맞는 관리를 시작해볼까요?</Text>
        <Text style={s.description}>
          분석된 건강 정보를 바탕으로{'\n'}원하는 관리 방법을 선택해 주세요.
        </Text>
      </View>
      <View style={s.body}>
        {(
          [
            {
              path: '/diet',
              title: '맞춤 식단 관리',
              description: '내 건강 상태에 맞는 식단을 추천받아 보세요.',
            },
            {
              path: '/exercise',
              title: '맞춤 운동 관리',
              description: '현재 목표에 맞는 운동 프로그램을 추천받아 보세요.',
            },
            {
              path: '/home',
              title: '나중에 할게요',
              description: '홈으로 이동하여 나중에 시작할 수 있어요.',
            },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.path}
            accessibilityRole="button"
            onPress={() => open(item.path)}
            style={s.card}
          >
            <View style={s.copy}>
              <Text style={s.title}>{item.title}</Text>
              <Text style={s.description}>{item.description}</Text>
            </View>
            <Chevron />
          </Pressable>
        ))}
        <Text style={s.note}>
          추천 내용은 입력한 건강 데이터를 기반으로 생성되며, 언제든지 설정에서 정보를 수정할 수
          있어요.
        </Text>
      </View>
    </MainScreen>
  );
}
const s = StyleSheet.create({
  head: { paddingHorizontal: 20, gap: 8 },
  label: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, color: colors.primary },
  headline: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.textPrimary,
  },
  body: { paddingHorizontal: 20, paddingTop: 28, gap: 12 },
  card: {
    minHeight: 92,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: { flex: 1, gap: 6 },
  title: { fontFamily: fontFamilies.pretendardBold, fontSize: 17, color: colors.textPrimary },
  description: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  note: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
