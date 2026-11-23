import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aForm } from '@/src/components/a/form';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

// Where it is uncomfortable, then a routine that spares it. The words are the app's; only the look is A's.
const parts = ['목', '어깨', '허리', '무릎', '손목'];

export default function BodyGuide() {
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState('어깨');
  return <View style={s.root}>
    <ScreenHeader onBack={() => router.back()} title="부위별 운동 가이드" />
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 16 }]}>
      <Text accessibilityRole="header" style={s.hero}>몸 상태에 맞춰 운동을 살펴봐요</Text>
      <View style={s.chips}>{parts.map((part) => <Pressable key={part} accessibilityRole="button" accessibilityState={{ selected: selected === part }} onPress={() => setSelected(part)} style={[s.chip, selected === part && s.on]}><Text style={[s.chipText, selected === part && s.onText]}>{part}</Text></Pressable>)}</View>
      <View style={s.card}>
        <Text style={s.title}>{selected} 운동 가이드</Text>
        <Text style={s.body}>아직 {selected} 부위에 연결된 개인별 운동 가이드가 없어요. 불편한 부위를 반영해 오늘 할 운동을 추천받을 수 있어요.</Text>
        <View style={s.line} />
        <Text style={s.title}>운동할 때 참고하세요</Text>
        <Text style={s.body}>운동 중 불편함이 생기면 잠시 멈추고 상태를 확인해 주세요. 운동 추천은 지금 컨디션과 불편한 부위를 넣어 다시 받을 수 있어요.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/condition', params: { discomfortArea: selected } })} style={({ pressed }) => [s.go, pressed && s.goPressed]}><Text style={s.goText}>{selected} 불편함을 반영해 추천받기</Text></Pressable>
    </ScrollView>
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 14, paddingHorizontal: 16, paddingTop: 12 },
    hero: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 24, lineHeight: 30 },
    chips: { flexDirection: 'row', gap: 6 },
    chip: { ...a.chip, flex: 1 },
    chipText: a.segText,
    on: a.on,
    onText: a.onText,
    card: { ...a.card, gap: 8, padding: 16 },
    title: { ...a.p15, color: colors.textPrimary },
    body: { ...a.p12, color: colors.textBody },
    line: { backgroundColor: colors.surfaceMuted, height: 2, marginVertical: 6 },
    go: { ...a.go, height: 52 },
    goPressed: a.goPressed,
    // the button's words are long: the plain pixel letters, not the big bold ones
    goText: { ...a.p15, color: colors.onPrimary },
  } as const;
}
