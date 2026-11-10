import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getPostureCapabilities, type PostureCapability } from '@/src/api/posture';
import { getApiErrorMessage } from '@/src/api/client';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import CameraIcon from '@/assets/icons/ui/camera.svg';
import UploadIcon from '@/assets/icons/ui/upload-simple.svg';

const viewLabel = (view: string) => (view === 'front' ? '앞에서' : '옆에서');

export default function PostureCheck() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<PostureCapability[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setError('');
    // Only what production has validated is offered; the app never fixes the list itself.
    void getPostureCapabilities()
      .then((data) => { if (active) setExercises(data.exercises.filter((item) => item.validation_status === 'validated')); })
      .catch((cause) => { if (active) setError(getApiErrorMessage(cause)); });
    return () => { active = false; };
  }, []));

  const current = exercises?.[selected] ?? null;
  const open = (source?: 'album') => current && router.push({
    pathname: '/exercise/posture-capture',
    params: { exerciseCode: current.exercise_code, cameraView: current.camera_view, name: current.display_name_ko, ...(source ? { source } : {}) },
  });

  return <View style={s.root}>
    <ScreenHeader onBack={() => router.back()} title="자세 점검" />
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 8, paddingBottom: insets.bottom + 36 }]}>
      <Text style={s.hero}>{current ? `${viewLabel(current.camera_view)} 10초만 찍으면\n자세를 확인할 수 있어요` : '자세 점검'}</Text>
      {error ? <Text style={s.error}>{error}</Text>
        : !exercises ? <ActivityIndicator color={colors.textPrimary} />
          : !current ? <Text style={s.body}>지금은 자세를 분석할 수 있는 운동이 없어요.</Text> : <>
            <View style={s.chips}>{exercises.map((item, index) => <Pressable accessibilityRole="button" accessibilityState={{ selected: index === selected }} key={item.exercise_code + item.camera_view} onPress={() => setSelected(index)} style={[s.chip, index === selected && s.chipSelected]}>
              <Text style={[s.chipText, index === selected && s.chipTextSelected]}>{item.display_name_ko} · {viewLabel(item.camera_view)}</Text></Pressable>)}</View>
            <View style={s.options}>
              <Pressable accessibilityRole="button" onPress={() => open()} style={s.option}><View style={s.icon}><CameraIcon color={colors.textPrimary} height={22} width={22} /></View><View style={s.optionCopy}><Text style={s.optionTitle}>지금 찍기</Text><Text style={s.optionDetail}>10초 · 천천히 3~5회</Text></View></Pressable>
              <Pressable accessibilityRole="button" onPress={() => open('album')} style={s.option}><View style={s.icon}><UploadIcon color={colors.textPrimary} height={22} width={22} /></View><View style={s.optionCopy}><Text style={s.optionTitle}>영상 올리기</Text><Text style={s.optionDetail}>앨범에서 · 30초 이하</Text></View></Pressable>
            </View>
            <View style={s.tip}><Text style={s.tipTitle}>촬영 전에 확인해 주세요</Text>
              {current.capture_instructions.map((line) => <Text key={line} style={s.tipText}>• {line}</Text>)}
              <Text style={s.tipText}>• 영상은 분석에만 쓰고, 분석이 끝나면 서버에서 바로 지워요.</Text>
            </View>
            {current.limitations.length > 0 ? <View style={s.tip}><Text style={s.tipTitle}>이런 점은 정확하지 않을 수 있어요</Text>
              {current.limitations.map((line) => <Text key={line} style={s.tipText}>• {line}</Text>)}</View> : null}
          </>}
    </ScrollView>
  </View>;
}

function createSStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, gap: 16 },
    hero: { color: colors.textPrimary, fontSize: 22, lineHeight: 30, fontFamily: fontFamilies.pretendardBold, marginTop: 12 }, body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', backgroundColor: colors.surface }, chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textPrimary, fontSize: 14 }, chipTextSelected: { color: '#FFFFFF' },
    options: { flexDirection: 'row', gap: 9 },
    option: { flex: 1, minHeight: 118, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, justifyContent: 'space-between', gap: 8 }, icon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 }, optionCopy: { gap: 3 }, optionTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, optionDetail: { color: colors.textSecondary, fontSize: 12 },
    tip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 8 }, tipTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardBold }, tipText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  } as const;
}
