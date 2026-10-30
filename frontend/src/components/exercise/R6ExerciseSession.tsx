import { useEffect, useRef, useState } from 'react';
import {
  Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseSessionExercise, ExerciseSessionState } from '@/src/features/exercise/ExerciseSessionContext';
import { defaultVoiceGuideSettings, loadVoiceGuideSettings, saveVoiceGuideSettings, speakGuide, stopGuide, type VoiceGuideSettings } from '@/src/features/exercise/voiceGuide';
import { fontFamilies } from '@/src/theme';

const purple = '#503DD7';
const ink = '#1E1D24';
const muted = '#777681';
const border = '#E3E4E9';
const parts = ['목', '어깨', '허리', '무릎', '손목', '발목', '기타'];

type Props = {
  exercise: ExerciseSessionExercise;
  session: ExerciseSessionState;
  onBack: () => void;
  onCompleteSet: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onTogglePause: () => void;
};

function time(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function R6ExerciseSession({
  exercise, session, onBack, onCompleteSet, onContinue, onSkip, onTogglePause,
}: Props) {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resumeAfterSheet, setResumeAfterSheet] = useState(false);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<'hard' | 'normal' | 'okay'>('normal');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceGuideSettings>(defaultVoiceGuideSettings);
  const lastSpoken = useRef('');
  useEffect(() => {
    let active = true;
    void loadVoiceGuideSettings().then((value) => { if (active) setVoice(value); });
    return () => { active = false; stopGuide(); };
  }, []);
  useEffect(() => {
    if (!voice.enabled || session.paused || voiceOpen || sheetOpen) { stopGuide(); return; }
    const key = `${session.currentExerciseIndex}:${session.currentSet}:${session.currentRep}`;
    if (key === lastSpoken.current) return;
    const newExercise = !lastSpoken.current || !lastSpoken.current.startsWith(`${session.currentExerciseIndex}:`);
    lastSpoken.current = key;
    if (newExercise) speakGuide(`${exercise.name}. ${exercise.instruction ?? ''}`, voice);
    else if (voice.countReps && exercise.mode === 'reps' && session.currentRep > 0) speakGuide(`${session.currentRep}회`, voice);
  }, [exercise.name, exercise.instruction, exercise.mode, session.currentExerciseIndex, session.currentSet, session.currentRep, session.paused, voice, voiceOpen, sheetOpen]);
  const updateVoice = (patch: Partial<VoiceGuideSettings>) => {
    const next = { ...voice, ...patch };
    setVoice(next);
    void saveVoiceGuideSettings(next).catch(() => Alert.alert('저장 실패', '음성 설정을 저장하지 못했어요.'));
    if (!next.enabled) stopGuide();
  };
  const progress = (session.currentExerciseIndex + 1) / session.exercises.length;
  const setProgress = exercise.mode === 'reps'
    ? Math.min(1, session.currentRep / Math.max(1, exercise.targetRepetitions ?? 1))
    : Math.min(1, 1 - session.setRemainingMs / Math.max(1, (exercise.targetSeconds ?? 1) * 1000));
  const openVideo = () => {
    const url = exercise.demoVideoUrl;
    if (!url || !/^https:\/\//i.test(url)) return;
    void Linking.openURL(url).catch(() => Alert.alert('영상을 열지 못했어요', '잠시 후 다시 시도해 주세요.'));
  };
  const togglePart = (part: string) => {
    setSelectedParts((current) => current.includes(part) ? current.filter((item) => item !== part) : [...current, part]);
  };
  const openSheet = () => {
    if (!session.paused) {
      onTogglePause();
      setResumeAfterSheet(true);
    }
    setSheetOpen(true);
  };
  const continueWorkout = () => {
    setSheetOpen(false);
    if (resumeAfterSheet) onTogglePause();
    setResumeAfterSheet(false);
    onContinue();
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="운동 나가기" onPress={onBack} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
          <Text style={s.headerTitle}>운동하기</Text>
          <View style={s.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="음성 안내 설정" onPress={() => setVoiceOpen(true)}><Text style={s.voiceAction}>◖))</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={session.paused ? '운동 재개' : '운동 일시정지'} onPress={onTogglePause} style={s.pause}><Text style={s.pauseText}>{session.paused ? '▶' : 'Ⅱ'}</Text></Pressable></View>
        </View>
        <View style={s.progressHeading}><Text style={s.progressLabel}>{session.currentExerciseIndex + 1} / {session.exercises.length} 동작</Text><Text style={s.progressLabel}>{time(Math.floor(session.elapsedExerciseMs / 1000))}</Text></View>
        <View style={s.track}><View style={[s.fill, { width: `${progress * 100}%` }]} /></View>
        <Text style={s.exerciseTitle}>{exercise.name}</Text>

        <View style={s.media}>
          {exercise.thumbnailUrl ? <Image source={{ uri: exercise.thumbnailUrl }} resizeMode="cover" style={s.mediaImage} /> : null}
          {exercise.demoVideoUrl && /^https:\/\//i.test(exercise.demoVideoUrl) ? (
            <Pressable accessibilityRole="button" onPress={openVideo} style={s.videoAction}>
              <Text style={s.play}>▶</Text><Text style={s.videoText}>동작 영상 보기</Text>
            </Pressable>
          ) : <Text style={s.mediaPlaceholder}>동작 영상이 제공되지 않았어요</Text>}
        </View>
        <Text style={s.voiceHint}>{voice.enabled ? '기기 음성으로 운동을 안내해요' : '음성 안내를 켜거나 화면을 보며 따라 해주세요'}</Text>

        <View style={s.repArea}>
          <Text style={s.repNumber}>
            {exercise.mode === 'reps' ? session.currentRep : time(Math.ceil(session.setRemainingMs / 1000))}
            <Text style={s.repTotal}>{exercise.mode === 'reps' ? ` / ${exercise.targetRepetitions}회` : ''}</Text>
          </Text>
          <Text style={s.setText}>총 {exercise.totalSets}세트 · 현재 {session.currentSet}세트</Text>
          <View style={s.track}><View style={[s.fill, { width: `${setProgress * 100}%` }]} /></View>
          <View style={s.setMarkers}>
            {Array.from({ length: exercise.totalSets }, (_, index) => (
              <Text key={index} style={[s.marker, index + 1 === session.currentSet && s.markerActive]}>{index + 1}세트</Text>
            ))}
          </View>
        </View>
        <View style={s.tipCard}>
          <Text style={s.tipTitle}>자세 팁</Text>
          <Text style={s.tipText}>{exercise.instruction ?? '무리하지 않고 천천히 움직여 주세요.'}</Text>
        </View>
        <View style={s.nextCard}>
          <Text style={s.tipTitle}>다음 동작</Text>
          <Text style={s.tipText}>{session.exercises[session.currentExerciseIndex + 1]?.name ?? '마지막 동작이에요'}</Text>
        </View>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={openSheet} style={s.secondaryButton}><Text style={s.secondaryText}>몸이 불편해요</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onCompleteSet} style={s.primaryButton}><Text style={s.primaryText}>세트 완료</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={onSkip} style={s.skipButton}><Text style={s.skipText}>이 동작 건너뛰기</Text></Pressable>
      </ScrollView>

      <Modal animationType="slide" onRequestClose={continueWorkout} transparent visible={sheetOpen}>
        <View style={s.sheetOverlay}>
          <Pressable accessibilityLabel="닫기" accessibilityRole="button" onPress={continueWorkout} style={s.sheetDim} />
          <View style={[s.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <View style={s.sheetHeading}><Text style={s.sheetTitle}>어디가 불편했나요?</Text><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={continueWorkout}><Text style={s.close}>×</Text></Pressable></View>
            <Text style={s.sheetDescription}>운동을 잠시 쉬고 몸 상태를 확인하세요. 이 선택은 아직 저장되지 않으며 남은 운동을 자동으로 바꾸지 않아요.</Text>
            <View style={s.notice}><Text style={s.noticeText}>⚠  통증이 심하면 운동을 멈추고 전문가와 상담하세요.</Text></View>
            <Text style={s.fieldTitle}>불편한 곳 <Text style={s.optional}>여러 곳 선택</Text></Text>
            <View style={s.chips}>{parts.map((part) => (
              <Pressable key={part} accessibilityRole="button" accessibilityState={{ selected: selectedParts.includes(part) }} onPress={() => togglePart(part)} style={[s.chip, selectedParts.includes(part) && s.selectedChip]}>
                <Text style={[s.chipText, selectedParts.includes(part) && s.selectedChipText]}>{part}</Text>
              </Pressable>
            ))}</View>
            <Text style={s.fieldTitle}>어떤 느낌인가요?</Text>
            <View style={s.feelings}>{([['hard', '너무 힘들어요'], ['normal', '버거워요'], ['okay', '괜찮아요']] as const).map(([key, label]) => (
              <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: feeling === key }} onPress={() => setFeeling(key)} style={[s.feeling, feeling === key && s.selectedChip]}>
                <Text style={[s.chipText, feeling === key && s.selectedChipText]}>{label}</Text>
              </Pressable>
            ))}</View>
            <View style={s.actions}>
              <Pressable accessibilityRole="button" onPress={() => { setSheetOpen(false); onBack(); }} style={s.secondaryButton}><Text style={s.secondaryText}>오늘은 그만하기</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={continueWorkout} style={s.primaryButton}><Text style={s.primaryText}>운동 이어하기</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" onRequestClose={() => setVoiceOpen(false)} transparent visible={voiceOpen}>
        <View style={s.sheetOverlay}><Pressable accessibilityLabel="닫기" accessibilityRole="button" onPress={() => setVoiceOpen(false)} style={s.sheetDim} />
          <View style={[s.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <View style={s.sheetHeading}><Text style={s.sheetTitle}>음성 안내</Text><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setVoiceOpen(false)}><Text style={s.close}>×</Text></Pressable></View>
            <Text style={s.sheetDescription}>기기의 한국어 음성으로 운동 이름과 횟수를 알려드려요.</Text>
            {([['enabled', '음성 안내', '운동 중 기기 음성을 재생해요'], ['countReps', '횟수 세어 주기', '반복 횟수를 말해요'], ['announceRest', '쉬는 시간 알려 주기', '휴식 시작을 말해요']] as const).map(([key, title, detail]) => <Pressable key={key} accessibilityRole="switch" accessibilityState={{ checked: voice[key] }} onPress={() => updateVoice({ [key]: !voice[key] })} style={s.voiceRow}><View style={{ flex: 1 }}><Text style={s.fieldTitle}>{title}</Text><Text style={s.sheetDescription}>{detail}</Text></View><View style={[s.switch, voice[key] && s.switchOn]}><View style={[s.switchThumb, voice[key] && s.switchThumbOn]} /></View></Pressable>)}
            <Text style={s.fieldTitle}>목소리</Text><View style={s.chips}><View style={[s.chip, s.selectedChip]}><Text style={s.selectedChipText}>기기 기본 음성</Text></View><Text style={s.unavailable}>코치·남 / 코치·여 / 뤼니 음성은 준비 중</Text></View>
            <Text style={s.fieldTitle}>말하기 속도</Text><View style={s.feelings}>{([['slow', '천천히'], ['normal', '보통'], ['fast', '빠르게']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: voice.speed === key }} onPress={() => updateVoice({ speed: key })} style={[s.feeling, voice.speed === key && s.selectedChip]}><Text style={[s.chipText, voice.speed === key && s.selectedChipText]}>{label}</Text></Pressable>)}</View>
            <Text style={s.unavailable}>음악 소리 자동 조절은 현재 지원하지 않아요.</Text>
            <Pressable accessibilityRole="button" onPress={() => setVoiceOpen(false)} style={s.primaryButton}><Text style={s.primaryText}>완료</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' }, content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  header: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 32, justifyContent: 'center' }, backText: { fontSize: 32, color: ink },
  headerTitle: { fontSize: 16, color: ink, fontFamily: fontFamilies.pretendardBold }, headerActions: { flexDirection: 'row', gap: 15, alignItems: 'center' }, voiceAction: { color: ink, fontSize: 16 },
  pause: { width: 32, alignItems: 'flex-end' }, pauseText: { fontSize: 19, color: ink },
  progressHeading: { flexDirection: 'row', justifyContent: 'space-between' }, progressLabel: { fontSize: 12, color: muted },
  track: { height: 6, borderRadius: 4, backgroundColor: '#E8E8ED', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: purple }, exerciseTitle: { color: ink, fontSize: 19, fontFamily: fontFamilies.pretendardBold, marginTop: 3 },
  media: { height: 190, borderRadius: 12, backgroundColor: '#F4F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mediaImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  videoAction: { backgroundColor: '#FFFFFFDD', borderRadius: 24, paddingHorizontal: 15, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', gap: 8 },
  play: { color: purple, fontSize: 15 }, videoText: { color: ink, fontSize: 12, fontFamily: fontFamilies.pretendardSemiBold },
  mediaPlaceholder: { color: muted, fontSize: 13 }, voiceHint: { color: muted, fontSize: 11, textAlign: 'center' },
  repArea: { alignItems: 'center', gap: 8, paddingVertical: 4 }, repNumber: { color: ink, fontSize: 44, fontFamily: fontFamilies.pretendardBold },
  repTotal: { color: muted, fontSize: 17, fontFamily: fontFamilies.pretendardMedium }, setText: { color: muted, fontSize: 12 },
  setMarkers: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' }, marker: { color: muted, fontSize: 11 },
  markerActive: { color: purple, fontFamily: fontFamilies.pretendardBold },
  tipCard: { borderColor: border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 5 },
  nextCard: { borderColor: border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 5 },
  tipTitle: { color: ink, fontSize: 13, fontFamily: fontFamilies.pretendardBold }, tipText: { color: muted, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 }, secondaryButton: { flex: 1, height: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F2F4' },
  secondaryText: { color: ink, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  primaryButton: { flex: 1, height: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: purple },
  primaryText: { color: '#FFF', fontSize: 13, fontFamily: fontFamilies.pretendardBold },
  skipButton: { alignItems: 'center', paddingVertical: 10 }, skipText: { color: muted, fontSize: 12 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetDim: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 14 },
  sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: ink, fontSize: 17, fontFamily: fontFamilies.pretendardBold }, close: { color: muted, fontSize: 24 },
  sheetDescription: { color: muted, fontSize: 12, lineHeight: 18 }, notice: { backgroundColor: '#FFF4E2', borderRadius: 9, padding: 11 },
  noticeText: { color: '#8E641C', fontSize: 11 }, fieldTitle: { color: ink, fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  optional: { color: muted, fontSize: 11, fontFamily: fontFamilies.pretendardMedium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderRadius: 20, borderColor: border, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  selectedChip: { backgroundColor: purple, borderColor: purple }, chipText: { color: ink, fontSize: 12 }, selectedChipText: { color: '#FFF' },
  feelings: { flexDirection: 'row', gap: 7 }, feeling: { flex: 1, borderRadius: 20, borderColor: border, borderWidth: 1, alignItems: 'center', paddingVertical: 9 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 12 }, switch: { width: 42, height: 25, backgroundColor: '#D8D9DE', borderRadius: 15, padding: 3 }, switchOn: { backgroundColor: purple }, switchThumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#FFF' }, switchThumbOn: { alignSelf: 'flex-end' }, unavailable: { color: muted, fontSize: 11, lineHeight: 16, flexShrink: 1 },
});
