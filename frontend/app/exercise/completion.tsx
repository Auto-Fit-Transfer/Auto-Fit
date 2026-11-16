import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { getExerciseApiErrorMessage, saveExerciseSessionFeedback, type ExerciseSessionFeedbackInput } from '@/src/api/exercise';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

const intensities = [
  { label: '쉬웠어요', value: 2 },
  { label: '적당했어요', value: 3 },
  { label: '힘들었어요', value: 4 },
];
const changes: { label: string; value: ExerciseSessionFeedbackInput['postCondition'] }[] = [
  { label: '나아졌어요', value: 'good' },
  { label: '그대로예요', value: 'normal' },
  { label: '더 아파요', value: 'bad' },
];
const areas = [
  { label: '어깨', value: 'shoulder' }, { label: '허리', value: 'waist' },
  { label: '무릎', value: 'knee' }, { label: '발목', value: 'ankle' },
];

export default function ExerciseCompletionScreen() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { latestSession, markResultRecordCompleted, refreshHome, resultRecordCompleted } = useExerciseRoutine();
  const { clearSession, session, summary } = useExerciseSession();
  const [difficulty, setDifficulty] = useState(3);
  const [hadPain, setHadPain] = useState(false);
  const [change, setChange] = useState<ExerciseSessionFeedbackInput['postCondition']>('normal');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const sessionId = latestSession?.sessionId ?? session?.sessionId;
  const duration = latestSession?.durationMinutes ?? (session ? summary.durationMinutes : null);
  const count = latestSession?.itemCount ?? (session ? summary.completedCount : null);
  const doneSets = session ? session.results.reduce((sum, result) => sum + result.completedSets, 0) : null;
  const plannedSets = session ? session.exercises.reduce((sum, exercise) => sum + exercise.totalSets, 0) : null;

  useEffect(() => { if (!sessionId) void refreshHome(); }, [refreshHome, sessionId]);
  const goHome = useCallback(() => { clearSession(); router.dismissTo('/exercise'); }, [clearSession, router]);
  const save = async () => {
    if (saving) return;
    if (!sessionId) { Alert.alert('운동 기록을 찾지 못했어요', '운동 홈에서 다시 확인해 주세요.'); return; }
    if (resultRecordCompleted) { router.replace('/exercise/ai-report'); return; }
    setSaving(true);
    try {
      await saveExerciseSessionFeedback(sessionId, {
        note: null,
        perceivedDifficulty: difficulty,
        postCondition: hadPain ? change : 'good',
        uncomfortableAreas: hadPain ? selectedAreas : [],
      });
      markResultRecordCompleted();
      goHome();
    } catch (error) {
      Alert.alert('운동 느낌을 저장하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const toggleArea = (area: string) => setSelectedAreas((current) =>
    current.includes(area) ? current.filter((item) => item !== area) : [...current, area]);

  return (
    <View style={s.root}>
      <ScreenHeader onBack={goHome} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={s.check}><CheckIcon color={colors.success} height={28} width={28} /></View>
        <View>
          <Text style={s.title}>오늘 운동을 마쳤어요</Text>
          <Text style={s.subtitle}>기록이 저장됐어요.</Text>
        </View>
        <View style={s.metrics}>
          <View style={s.metric}><Text style={s.metricLabel}>운동 시간</Text><Text style={s.metricValue}>{duration == null ? '—' : `${duration}분`}</Text></View>
          <View style={s.metric}>
            <Text style={s.metricLabel}>마친 동작</Text>
            <Text style={s.metricValue}>{count == null ? '—' : `${count}개`}</Text>
            {session ? <Text style={s.metricNote}>계획 {session.exercises.length}개 중</Text> : null}
          </View>
          <View style={s.metric}>
            <Text style={s.metricLabel}>세트</Text>
            <Text style={s.metricValue}>{doneSets == null ? '—' : `${doneSets}세트`}</Text>
            {plannedSets ? <Text style={s.metricNote}>계획 {plannedSets}세트 중</Text> : null}
          </View>
        </View>
        <Text style={s.sectionTitle}>오늘 강도는 어땠나요? <Text style={s.optional}>선택</Text></Text>
        <View style={s.options}>{intensities.map(({ label, value }) => (
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: difficulty === value }} onPress={() => setDifficulty(value)} style={[s.option, difficulty === value && s.selected]}>
            <Text style={[s.optionText, difficulty === value && s.selectedText]}>{label}</Text>
          </Pressable>
        ))}</View>
        <Text style={s.sectionTitle}>운동하면서 아픈 곳은 없었나요?</Text>
        <View style={s.options}>{([['없었어요', false], ['있었어요', true]] as const).map(([label, value]) => (
          <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: hadPain === value }} onPress={() => setHadPain(value)} style={[s.option, hadPain === value && s.selected]}>
            <Text style={[s.optionText, hadPain === value && s.selectedText]}>{label}</Text>
          </Pressable>
        ))}</View>
        {hadPain ? (
          <>
            <Text style={s.helper}>아팠던 곳이 있으면 부위와 정도를 골라 다음 운동에 반영해요.</Text>
            <View style={s.chips}>{areas.map(({ label, value }) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: selectedAreas.includes(value) }} onPress={() => toggleArea(value)} style={[s.chip, selectedAreas.includes(value) && s.selected]}>
                <Text style={[s.optionText, selectedAreas.includes(value) && s.selectedText]}>{label}</Text>
              </Pressable>
            ))}</View>
            <Text style={s.sectionTitle}>지금은 어때요?</Text>
            <View style={s.options}>{changes.map(({ label, value }) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: change === value }} onPress={() => setChange(value)} style={[s.option, change === value && s.selected]}>
                <Text style={[s.optionText, change === value && s.selectedText]}>{label}</Text>
              </Pressable>
            ))}</View>
          </>
        ) : null}
        <Pressable accessibilityRole="button" disabled={saving || !sessionId} onPress={() => void save()} style={[s.primaryButton, (saving || !sessionId) && s.disabled]}>
          <Text style={[s.primaryText, (saving || !sessionId) && s.disabledText]}>{saving ? '저장 중…' : resultRecordCompleted ? '분석 보기' : '완료'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createSStyles({ colors }: AppTheme) {
  // Renewal A: one dark outline on every piece, a ledge under what can be pressed, pixel letters.
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const outline = { backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 2 } as const;
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },
    check: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.gold, borderColor: colors.ink, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.ink, fontSize: 24, lineHeight: 28, fontFamily: fontFamilies.galmuri11Bold },
    subtitle: { ...p15, color: colors.textBody },
    metrics: { ...outline, borderRadius: 18, boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)', flexDirection: 'row', paddingVertical: 16 },
    metric: { alignItems: 'center', flex: 1, gap: 2 },
    metricLabel: { ...p12, color: colors.textSecondary },
    metricValue: { color: colors.ink, fontSize: 24, lineHeight: 28, fontFamily: fontFamilies.galmuri11Bold },
    metricNote: { ...p12, color: colors.textSecondary },
    sectionTitle: { ...p15, color: colors.ink, marginTop: 4 },
    optional: { ...p12, color: colors.textSecondary },
    helper: { ...p12, color: colors.textSecondary },
    options: { flexDirection: 'row', gap: 6 },
    option: { ...outline, alignItems: 'center', borderRadius: 14, boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)', flex: 1, height: 46, justifyContent: 'center', paddingHorizontal: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { ...outline, alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', paddingHorizontal: 14 },
    selected: { backgroundColor: colors.primary, borderColor: colors.ink },
    optionText: { ...p15, color: colors.ink },
    selectedText: { color: colors.onPrimary },
    primaryButton: { height: 52, borderRadius: 14, backgroundColor: colors.primary, borderColor: colors.ink, borderWidth: 2, boxShadow: `0 4px 0 ${colors.ink}`, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    primaryText: { color: colors.onPrimary, fontSize: 22, lineHeight: 26, fontFamily: fontFamilies.galmuri11Bold }, disabled: { backgroundColor: colors.surfaceMuted }, disabledText: { color: colors.textDisabled },
  } as const;
}
