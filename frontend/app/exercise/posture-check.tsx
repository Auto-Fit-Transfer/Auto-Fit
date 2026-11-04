import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamilies } from '@/src/theme';
import { Text } from '@/src/components/common';
import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import UploadIcon from '@/assets/icons/ui/upload-simple.svg';

const purple = '#5246C6';
const exercises = ['스쿼트', '푸시업', '런지', '플랭크'];

export default function PostureCheck() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 }]}>
      <View style={s.header}><Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()}><CaretLeftIcon color="#17161D" height={24} width={24} /></Pressable><Text style={s.title}>자세 점검</Text><View style={{ width: 24 }} /></View>
      <Text style={s.hero}>옆에서 10초만 찍으면{ '\n' }자세를 확인할 수 있어요</Text>
      <Text style={s.body}>스쿼트 영상을 찍거나 골라 주세요. 자세 분석은 준비 중이에요.</Text>
      <View style={s.chips}>{exercises.map((name) => <View key={name} style={[s.chip, name === '스쿼트' && s.chipSelected]}><Text style={[s.chipText, name === '스쿼트' && s.chipTextSelected]}>{name}{name !== '스쿼트' ? ' · 준비 중' : ''}</Text></View>)}</View>
      <View style={s.options}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/posture-capture')} style={s.option}><View style={s.icon}><CameraIcon color="#17161D" height={22} width={22} /></View><View style={s.optionCopy}><Text style={s.optionTitle}>지금 찍기</Text><Text style={s.optionDetail}>10초 · 천천히 3~5회</Text></View></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/posture-capture', params: { source: 'album' } })} style={s.option}><View style={s.icon}><UploadIcon color="#17161D" height={22} width={22} /></View><View style={s.optionCopy}><Text style={s.optionTitle}>영상 올리기</Text><Text style={s.optionDetail}>앨범에서 · 10초 이하</Text></View></Pressable>
      </View>
      <View style={s.preview}><View style={s.person}><Text style={s.personText}>◯{'\n'}╱│╲{'\n'}╱ ╲</Text></View><Text style={s.previewText}>전신이 화면 안에 보이게 카메라를 옆에 놓아 주세요</Text></View>
      <View style={s.tip}><Text style={s.tipTitle}>촬영 전에 확인해 주세요</Text><Text style={s.tipText}>• 몸 전체가 프레임 안에 보이도록 해주세요.</Text><Text style={s.tipText}>• 가능한 한 밝은 곳에서 옆모습을 찍어 주세요.</Text><Text style={s.tipText}>• 촬영한 영상은 분석 기능이 준비되기 전까지 서버에 전송되지 않아요.</Text></View>
      <Text style={s.section}>최근 점검 결과</Text><View style={s.empty}><Text style={s.emptyText}>아직 연결된 분석 결과가 없어요</Text></View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingHorizontal: 20, gap: 16 },
  header: { height: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, back: { color: '#17161D', fontSize: 32, lineHeight: 36 }, title: { color: '#17161D', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  hero: { color: '#17161D', fontSize: 24, lineHeight: 32, fontFamily: fontFamilies.pretendardBold, marginTop: 12 }, body: { color: '#5E5D66', fontSize: 14, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderWidth: 1, borderColor: '#DFE2E7', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FAFBFC' }, chipSelected: { backgroundColor: purple, borderColor: purple }, chipText: { color: '#5E5D66', fontSize: 14 }, chipTextSelected: { color: '#FFFFFF' },
  preview: { height: 190, backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 }, person: { backgroundColor: '#FAFBFC', borderStyle: 'dashed', borderWidth: 1, borderColor: '#C3C5C8', borderRadius: 16, height: 136, width: 98, alignItems: 'center', justifyContent: 'center' }, personText: { color: '#9DA0A4', fontSize: 25, textAlign: 'center', lineHeight: 32 }, previewText: { color: '#5E5D66', fontSize: 12 },
  options: { flexDirection: 'row', gap: 9 },
  option: { flex: 1, minHeight: 118, backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#DFE2E7', borderRadius: 12, padding: 14, justifyContent: 'space-between', gap: 8 }, icon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 }, iconText: { color: '#17161D', fontSize: 19 }, optionCopy: { gap: 3 }, optionTitle: { color: '#17161D', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, optionDetail: { color: '#5E5D66', fontSize: 12 },
  tip: { backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#DFE2E7', borderRadius: 12, padding: 16, gap: 8 }, tipTitle: { color: '#17161D', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, tipText: { color: '#5E5D66', fontSize: 14, lineHeight: 18 }, section: { color: '#17161D', fontSize: 16, fontFamily: fontFamilies.pretendardBold }, empty: { padding: 22, alignItems: 'center', borderRadius: 12, backgroundColor: '#FFF' }, emptyText: { color: '#5E5D66', fontSize: 14 },
});
