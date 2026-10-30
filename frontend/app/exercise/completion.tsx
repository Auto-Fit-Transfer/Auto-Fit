import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExerciseApiErrorMessage, saveExerciseSessionFeedback, type ExerciseSessionFeedbackInput } from '@/src/api/exercise';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const ink = '#1E1D24';
const muted = '#777681';
const border = '#E3E4EA';
const moods: { label: string; value: ExerciseSessionFeedbackInput['postCondition'] }[] = [
  { label: '아주 좋아요', value: 'very_good' },
  { label: '좋아요', value: 'good' },
  { label: '보통이에요', value: 'normal' },
  { label: '힘들었어요', value: 'bad' },
  { label: '많이 힘들었어요', value: 'very_bad' },
];
const areas = [
  { label: '어깨', value: 'shoulder' }, { label: '허리', value: 'waist' },
  { label: '무릎', value: 'knee' }, { label: '발목', value: 'ankle' },
];

export default function ExerciseCompletionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { latestSession, markResultRecordCompleted, refreshHome, resultRecordCompleted } = useExerciseRoutine();
  const { clearSession, session, summary } = useExerciseSession();
  const [mood, setMood] = useState<ExerciseSessionFeedbackInput['postCondition']>('good');
  const [difficulty, setDifficulty] = useState(3);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const sessionId = latestSession?.sessionId ?? session?.sessionId;
  const duration = latestSession?.durationMinutes ?? (session ? summary.durationMinutes : null);
  const count = latestSession?.itemCount ?? (session ? summary.completedCount : null);
  const calories = latestSession?.calories ?? (session ? summary.calories : null);

  useEffect(() => { if (!sessionId) void refreshHome(); }, [refreshHome, sessionId]);
  const goHome = useCallback(() => { clearSession(); router.dismissTo('/exercise'); }, [clearSession, router]);
  const save = async () => {
    if (saving) return;
    if (!sessionId) { Alert.alert('운동 기록을 찾지 못했어요', '운동 홈에서 다시 확인해 주세요.'); return; }
    if (resultRecordCompleted) { router.replace('/exercise/ai-report'); return; }
    setSaving(true);
    try {
      await saveExerciseSessionFeedback(sessionId, {
        note: note.trim() || null,
        perceivedDifficulty: difficulty,
        postCondition: mood,
        uncomfortableAreas: selectedAreas,
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
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="운동 홈으로" onPress={goHome}><Text style={s.back}>‹</Text></Pressable>
          <Text style={s.headerTitle}>운동 결과</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.check}><Text style={s.checkText}>✓</Text></View>
        <Text style={s.title}>오늘 운동을 마쳤어요</Text>
        <Text style={s.subtitle}>운동 기록이 저장됐어요.</Text>
        <View style={s.card}>
          <View style={s.metricRow}>
            <View style={s.metric}><Text style={s.metricLabel}>운동 시간</Text><Text style={s.metricValue}>{duration == null ? '—' : `${duration}분`}</Text></View>
            <View style={s.metric}><Text style={s.metricLabel}>마친 동작</Text><Text style={s.metricValue}>{count == null ? '—' : `${count}개`}</Text></View>
            <View style={s.metric}><Text style={s.metricLabel}>소모 열량</Text><Text style={s.metricValue}>{calories == null ? '—' : `${calories}kcal`}</Text></View>
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.sectionTitle}>오늘 바로 적용</Text>
          <Text style={s.body}>운동 후 몸 상태를 기록하면 다음 운동을 조정할 때 참고할 수 있어요.</Text>
        </View>
        <Text style={s.sectionTitle}>오늘 강도는 어땠나요?</Text>
        <View style={s.chips}>{[1, 2, 3, 4, 5].map((level) => (
          <Pressable key={level} accessibilityRole="button" accessibilityState={{ selected: difficulty === level }} onPress={() => setDifficulty(level)} style={[s.chip, difficulty === level && s.selectedChip]}>
            <Text style={[s.chipText, difficulty === level && s.selectedText]}>{['아주 쉬움', '쉬움', '보통', '어려움', '매우 어려움'][level - 1]}</Text>
          </Pressable>
        ))}</View>
        <Text style={s.sectionTitle}>어때진 것 같아요?</Text>
        <View style={s.chips}>{moods.map(({ label, value }) => (
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mood === value }} onPress={() => setMood(value)} style={[s.chip, mood === value && s.selectedChip]}>
            <Text style={[s.chipText, mood === value && s.selectedText]}>{label}</Text>
          </Pressable>
        ))}</View>
        <Text style={s.sectionTitle}>불편했던 부위가 있나요? <Text style={s.optional}>선택</Text></Text>
        <View style={s.chips}>{areas.map(({ label, value }) => (
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: selectedAreas.includes(value) }} onPress={() => toggleArea(value)} style={[s.chip, selectedAreas.includes(value) && s.selectedChip]}>
            <Text style={[s.chipText, selectedAreas.includes(value) && s.selectedText]}>{label}</Text>
          </Pressable>
        ))}</View>
        <TextInput accessibilityLabel="운동 후 메모" maxLength={500} multiline onChangeText={setNote} placeholder="운동 후 느낌을 적어주세요 (선택)" style={s.note} value={note} />
        <Pressable accessibilityRole="button" disabled={saving || !sessionId} onPress={() => void save()} style={[s.primaryButton, (saving || !sessionId) && s.disabled]}>
          <Text style={s.primaryText}>{saving ? '저장 중...' : resultRecordCompleted ? '분석 보기' : '완료'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' }, content: { paddingHorizontal: 20, gap: 17 },
  header: { height: 43, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 32, color: ink, fontSize: 32 }, headerTitle: { color: ink, fontSize: 16, fontFamily: fontFamilies.pretendardBold }, headerSpacer: { width: 32 },
  check: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF7F0', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  checkText: { color: '#24925C', fontSize: 21 }, title: { color: ink, fontSize: 22, fontFamily: fontFamilies.pretendardBold },
  subtitle: { color: muted, fontSize: 13 }, card: { borderWidth: 1, borderColor: border, borderRadius: 12, padding: 15, gap: 8 },
  metricRow: { flexDirection: 'row' }, metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricLabel: { color: muted, fontSize: 11 }, metricValue: { color: ink, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
  sectionTitle: { color: ink, fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  body: { color: muted, fontSize: 12, lineHeight: 18 }, optional: { color: muted, fontSize: 11, fontFamily: fontFamilies.pretendardMedium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: border, borderRadius: 22, paddingHorizontal: 11, paddingVertical: 9 },
  selectedChip: { backgroundColor: purple, borderColor: purple }, chipText: { color: ink, fontSize: 11 }, selectedText: { color: '#FFF' },
  note: { borderColor: border, borderWidth: 1, borderRadius: 10, minHeight: 70, color: ink, padding: 12, fontSize: 12, textAlignVertical: 'top' },
  primaryButton: { height: 50, borderRadius: 9, backgroundColor: purple, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 15, fontFamily: fontFamilies.pretendardBold }, disabled: { opacity: 0.5 },
});
