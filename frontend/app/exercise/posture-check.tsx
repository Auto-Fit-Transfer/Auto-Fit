import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const exercises = ['스쿼트', '푸시업', '런지', '플랭크'];

export default function PostureCheck() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>자세 점검</Text><View style={{ width: 24 }} /></View>
      <Text style={s.hero}>옆에서 10초만 찍으면{ '\n' }자세를 확인할 수 있어요</Text>
      <Text style={s.body}>지금은 스쿼트 촬영과 영상 선택까지 사용할 수 있어요. 분석 기능이 연결되면 결과를 알려드릴게요.</Text>
      <View style={s.chips}>{exercises.map((name) => <View key={name} style={[s.chip, name === '스쿼트' && s.chipSelected]}><Text style={[s.chipText, name === '스쿼트' && s.chipTextSelected]}>{name}{name !== '스쿼트' ? ' · 준비 중' : ''}</Text></View>)}</View>
      <View style={s.options}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/posture-capture')} style={s.option}><View style={s.icon}><Text style={s.iconText}>●</Text></View><View style={s.optionCopy}><Text style={s.optionTitle}>지금 찍기</Text><Text style={s.optionDetail}>10초 · 천천히 3~5회</Text></View></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/posture-capture', params: { source: 'album' } })} style={s.option}><View style={s.icon}><Text style={s.iconText}>▣</Text></View><View style={s.optionCopy}><Text style={s.optionTitle}>영상 올리기</Text><Text style={s.optionDetail}>앨범에서 · 10초 이하</Text></View></Pressable>
      </View>
      <View style={s.preview}><View style={s.person}><Text style={s.personText}>◯{'\n'}╱│╲{'\n'}╱ ╲</Text></View><Text style={s.previewText}>전신이 화면 안에 보이게 카메라를 옆에 놓아 주세요</Text></View>
      <View style={s.tip}><Text style={s.tipTitle}>촬영 전에 확인해 주세요</Text><Text style={s.tipText}>• 몸 전체가 프레임 안에 보이도록 해주세요.</Text><Text style={s.tipText}>• 가능한 한 밝은 곳에서 옆모습을 찍어 주세요.</Text><Text style={s.tipText}>• 촬영한 영상은 분석 기능이 준비되기 전까지 서버에 전송되지 않아요.</Text></View>
      <Text style={s.section}>최근 점검 결과</Text><View style={s.empty}><Text style={s.emptyText}>아직 연결된 분석 결과가 없어요</Text></View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' }, content: { paddingHorizontal: 20, gap: 16 },
  header: { height: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, back: { color: '#1E1D24', fontSize: 32, lineHeight: 36 }, title: { color: '#1E1D24', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  hero: { color: '#1E1D24', fontSize: 24, lineHeight: 32, fontFamily: fontFamilies.pretendardBold, marginTop: 12 }, body: { color: '#777681', fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF' }, chipSelected: { backgroundColor: purple, borderColor: purple }, chipText: { color: '#777681', fontSize: 12 }, chipTextSelected: { color: '#FFF' },
  preview: { height: 190, backgroundColor: '#1C1E22', borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 10 }, person: { borderStyle: 'dashed', borderWidth: 1, borderColor: '#C3C5C8', borderRadius: 15, height: 136, width: 98, alignItems: 'center', justifyContent: 'center' }, personText: { color: '#9DA0A4', fontSize: 25, textAlign: 'center', lineHeight: 32 }, previewText: { color: '#FFF', fontSize: 11 },
  options: { flexDirection: 'row', gap: 9 },
  option: { flex: 1, minHeight: 118, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 12, padding: 14, justifyContent: 'space-between', gap: 8 }, icon: { width: 38, height: 38, backgroundColor: '#F0EEFC', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, iconText: { color: purple, fontSize: 19 }, optionCopy: { gap: 3 }, optionTitle: { color: '#1E1D24', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, optionDetail: { color: '#777681', fontSize: 11 },
  tip: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E5EB', borderRadius: 12, padding: 16, gap: 8 }, tipTitle: { color: '#1E1D24', fontSize: 13, fontFamily: fontFamilies.pretendardBold }, tipText: { color: '#777681', fontSize: 12, lineHeight: 18 }, section: { color: '#1E1D24', fontSize: 15, fontFamily: fontFamilies.pretendardBold }, empty: { padding: 22, alignItems: 'center', borderRadius: 12, backgroundColor: '#FFF' }, emptyText: { color: '#777681', fontSize: 12 },
});
