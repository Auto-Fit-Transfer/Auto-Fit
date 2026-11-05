import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UserIcon from '@/assets/icons/ui/user.svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import CameraIcon from '@/assets/icons/ui/camera.svg';
import UploadIcon from '@/assets/icons/ui/upload-simple.svg';

const exercises = ['스쿼트', '푸시업', '런지', '플랭크'];

export default function PostureCheck() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return <View style={s.root}>
    <ScreenHeader onBack={() => router.back()} title="자세 점검" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: insets.bottom + 36 }]}>
      <Text style={s.hero}>옆에서 10초만 찍으면{ '\n' }자세를 확인할 수 있어요</Text>
      <Text style={s.body}>스쿼트 영상을 찍거나 골라 주세요. 자세 분석은 준비 중이에요.</Text>
      <View style={s.chips}>{exercises.map((name) => <View key={name} style={[s.chip, name === '스쿼트' && s.chipSelected]}><Text style={[s.chipText, name === '스쿼트' && s.chipTextSelected]}>{name}{name !== '스쿼트' ? ' · 준비 중' : ''}</Text></View>)}</View>
      <View style={s.options}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/exercise/posture-capture')} style={s.option}><View style={s.icon}><CameraIcon color={colors.textPrimary} height={22} width={22} /></View><View style={s.optionCopy}><Text style={s.optionTitle}>지금 찍기</Text><Text style={s.optionDetail}>10초 · 천천히 3~5회</Text></View></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/posture-capture', params: { source: 'album' } })} style={s.option}><View style={s.icon}><UploadIcon color={colors.textPrimary} height={22} width={22} /></View><View style={s.optionCopy}><Text style={s.optionTitle}>영상 올리기</Text><Text style={s.optionDetail}>앨범에서 · 10초 이하</Text></View></Pressable>
      </View>
      <View style={s.preview}><View style={s.person}><UserIcon color={colors.textSecondary} height={64} width={64} /></View><Text style={s.previewText}>전신이 화면 안에 보이게 카메라를 옆에 놓아 주세요</Text></View>
      <View style={s.tip}><Text style={s.tipTitle}>촬영 전에 확인해 주세요</Text><Text style={s.tipText}>• 몸 전체가 프레임 안에 보이도록 해주세요.</Text><Text style={s.tipText}>• 가능한 한 밝은 곳에서 옆모습을 찍어 주세요.</Text><Text style={s.tipText}>• 촬영한 영상은 분석 기능이 준비되기 전까지 서버에 전송되지 않아요.</Text></View>
      <Text style={s.section}>최근 점검 결과</Text><View style={s.empty}><Text style={s.emptyText}>아직 연결된 분석 결과가 없어요</Text></View>
    </ScrollView>
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, gap: 16 },
    hero: { color: colors.textPrimary, fontSize: 22, lineHeight: 30, fontFamily: fontFamilies.pretendardBold, marginTop: 12 }, body: { color: colors.textSecondary, fontSize: 14, lineHeight: 19 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface }, chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textSecondary, fontSize: 14 }, chipTextSelected: { color: '#FFFFFF' },
    preview: { height: 190, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 }, person: { backgroundColor: colors.surface, borderStyle: 'dashed', borderWidth: 1, borderColor: '#C3C5C8', borderRadius: 16, height: 136, width: 98, alignItems: 'center', justifyContent: 'center' }, previewText: { color: colors.textSecondary, fontSize: 12 },
    options: { flexDirection: 'row', gap: 9 },
    option: { flex: 1, minHeight: 118, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, justifyContent: 'space-between', gap: 8 }, icon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 }, iconText: { color: colors.textPrimary, fontSize: 19 }, optionCopy: { gap: 3 }, optionTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, optionDetail: { color: colors.textSecondary, fontSize: 12 },
    tip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 8 }, tipTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, tipText: { color: colors.textSecondary, fontSize: 14, lineHeight: 18 }, section: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold }, empty: { padding: 22, alignItems: 'center', borderRadius: 12, backgroundColor: colors.background }, emptyText: { color: colors.textSecondary, fontSize: 14 },
  } as const;
}
