import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const parts = ['목', '어깨', '허리', '무릎', '손목'];

export default function BodyGuide() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState('어깨');
  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>부위별 운동 가이드</Text><View style={{ width: 24 }} /></View>
      <Text style={s.hero}>몸 상태에 맞춰 운동을 살펴봐요</Text>
      <Text style={s.caption}>불편한 부위를 선택하면 해당 부위의 가이드가 표시됩니다.</Text>
      <View style={s.chips}>{parts.map((part) => <Pressable key={part} accessibilityRole="button" accessibilityState={{ selected: selected === part }} onPress={() => setSelected(part)} style={[s.chip, selected === part && s.chipSelected]}><Text style={[s.chipText, selected === part && s.chipTextSelected]}>{part}</Text></Pressable>)}</View>
      <View style={s.card}><Text style={s.cardTitle}>{selected} 운동 가이드</Text><Text style={s.body}>아직 {selected} 부위에 연결된 개인별 운동 가이드가 없어요. 불편한 부위를 반영해 오늘 할 운동을 추천받을 수 있습니다.</Text></View>
      <View style={s.card}><Text style={s.cardTitle}>운동할 때 참고하세요</Text><Text style={s.body}>운동 중 불편함이 생기면 잠시 멈추고 상태를 확인해 주세요. 운동 추천은 현재 컨디션과 불편 부위를 입력해 다시 받을 수 있어요.</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/condition', params: { discomfortArea: selected } })} style={s.button}><Text style={s.buttonText}>{selected} 불편함을 반영해 추천받기</Text></Pressable>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' }, content: { paddingHorizontal: 20, gap: 18 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { color: '#1E1D24', fontSize: 32, lineHeight: 36 }, title: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  hero: { color: '#1E1D24', fontSize: 22, fontFamily: fontFamilies.pretendardBold, marginTop: 12 }, caption: { color: '#777681', fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', gap: 7 }, chip: { flex: 1, borderColor: '#E4E5EB', borderWidth: 1, borderRadius: 20, paddingVertical: 9, alignItems: 'center', backgroundColor: '#FFF' }, chipSelected: { backgroundColor: purple, borderColor: purple }, chipText: { color: '#777681', fontSize: 12 }, chipTextSelected: { color: '#FFF' },
  card: { backgroundColor: '#FFF', borderColor: '#E4E5EB', borderWidth: 1, borderRadius: 14, padding: 18, gap: 10 }, cardTitle: { color: '#1E1D24', fontSize: 15, fontFamily: fontFamilies.pretendardBold }, body: { color: '#55545F', fontSize: 13, lineHeight: 20 },
  button: { backgroundColor: purple, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold },
});
