import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

const parts = ['목', '어깨', '허리', '무릎', '손목'];

export default function BodyGuide() {
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState('어깨');
  return <View style={s.root}>
    <ScreenHeader onBack={() => router.back()} title="부위별 운동 가이드" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: insets.bottom + 36 }]}>
      <Text style={s.hero}>몸 상태에 맞춰 운동을 살펴봐요</Text>
      <View style={s.chips}>{parts.map((part) => <Pressable key={part} accessibilityRole="button" accessibilityState={{ selected: selected === part }} onPress={() => setSelected(part)} style={[s.chip, selected === part && s.chipSelected]}><Text style={[s.chipText, selected === part && s.chipTextSelected]}>{part}</Text></Pressable>)}</View>
      <View style={s.card}><Text style={s.cardTitle}>{selected} 운동 가이드</Text><Text style={s.body}>아직 {selected} 부위에 연결된 개인별 운동 가이드가 없어요. 불편한 부위를 반영해 오늘 할 운동을 추천받을 수 있습니다.</Text></View>
      <View style={s.card}><Text style={s.cardTitle}>운동할 때 참고하세요</Text><Text style={s.body}>운동 중 불편함이 생기면 잠시 멈추고 상태를 확인해 주세요. 운동 추천은 현재 컨디션과 불편 부위를 입력해 다시 받을 수 있어요.</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/condition', params: { discomfortArea: selected } })} style={s.button}><Text style={s.buttonText}>{selected} 불편함을 반영해 추천받기</Text></Pressable>
    </ScrollView>
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, gap: 18 },
    hero: { color: colors.textPrimary, fontSize: 22, fontFamily: fontFamilies.pretendardBold, marginTop: 12 }, caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 18 },
    chips: { flexDirection: 'row', gap: 7 }, chip: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface }, chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textSecondary, fontSize: 14 }, chipTextSelected: { color: '#FFFFFF' },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, gap: 10 }, cardTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold }, body: { color: colors.textBody, fontSize: 14, lineHeight: 20 },
    button: { backgroundColor: colors.primary, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  } as const;
}
