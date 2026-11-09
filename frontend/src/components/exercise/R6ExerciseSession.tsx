import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SpeakerIcon from '@/assets/icons/system/SpeakerSimpleHigh.svg';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import InfoIcon from '@/assets/icons/ui/info.svg';
import PauseIcon from '@/assets/icons/ui/pause-fill.svg';
import PlayIcon from '@/assets/icons/ui/play-fill.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import XIcon from '@/assets/icons/ui/x.svg';
import { discomfortFeelings as feelings } from '@/src/features/exercise/discomfortFeelings';
import type { ExerciseSessionExercise, ExerciseSessionState } from '@/src/features/exercise/ExerciseSessionContext';
import { defaultVoiceGuideSettings, loadVoiceGuideSettings, saveVoiceGuideSettings, speakGuide, stopGuide, type VoiceGuideSettings } from '@/src/features/exercise/voiceGuide';
import { fontFamilies, lightPalette, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

const parts = ['목', '어깨', '허리', '무릎', '손목', '발목', '기타'];

export type DiscomfortReport = {
  bodyAreas: string[];
  detail: string | null;
  severity: number;
  symptomType: 'fatigue' | 'pain';
};

type Props = {
  exercise: ExerciseSessionExercise;
  session: ExerciseSessionState;
  onAddRest: (seconds: number) => void;
  onBack: () => void;
  onCompleteSet: () => void;
  // Resolves to how many remaining items changed, or null when the report failed.
  onReportDiscomfort: (report: DiscomfortReport) => Promise<number | null>;
  onSkip: () => void;
  onSkipRest: () => void;
  onStopWorkout: () => void;
  onTogglePause: () => void;
};

function time(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function R6ExerciseSession({
  exercise, session, onAddRest, onBack, onCompleteSet, onReportDiscomfort, onSkip, onSkipRest, onStopWorkout, onTogglePause,
}: Props) {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resumeAfterSheet, setResumeAfterSheet] = useState(false);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<(typeof feelings)[number]['key']>('tingling');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changedCount, setChangedCount] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const chosenFeeling = feelings.find((item) => item.key === feeling) ?? feelings[0];
  const needsPart = !chosenFeeling.stops && selectedParts.length === 0;
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceGuideSettings>(defaultVoiceGuideSettings);
  const lastSpoken = useRef('');
  const resting = session.phase === 'rest';
  useEffect(() => {
    let active = true;
    void loadVoiceGuideSettings().then((value) => { if (active) setVoice(value); });
    return () => { active = false; stopGuide(); };
  }, []);
  useEffect(() => {
    if (resting) return;
    if (!voice.enabled || session.paused || voiceOpen || sheetOpen) { stopGuide(); return; }
    const key = `${session.currentExerciseIndex}:${session.currentSet}:${session.currentRep}`;
    if (key === lastSpoken.current) return;
    const newExercise = !lastSpoken.current || !lastSpoken.current.startsWith(`${session.currentExerciseIndex}:`);
    lastSpoken.current = key;
    if (newExercise) speakGuide(`${exercise.name}. ${exercise.instruction ?? ''}`, voice);
    else if (voice.countReps && exercise.mode === 'reps' && session.currentRep > 0) speakGuide(`${session.currentRep}회`, voice);
  }, [exercise.name, exercise.instruction, exercise.mode, resting, session.currentExerciseIndex, session.currentSet, session.currentRep, session.paused, voice, voiceOpen, sheetOpen]);
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
  const gifUrl = exercise.demoGifUrl && /^https:[/][/]/i.test(exercise.demoGifUrl) ? exercise.demoGifUrl : null;
  const videoUrl = exercise.demoVideoUrl && /^https:[/][/]/i.test(exercise.demoVideoUrl) ? exercise.demoVideoUrl : null;
  const imageUrl = gifUrl ?? exercise.thumbnailUrl;
  const next = session.exercises[session.currentExerciseIndex + 1];
  const openVideo = () => {
    if (!videoUrl) return;
    void Linking.openURL(videoUrl).catch(() => Alert.alert('영상을 열지 못했어요', '잠시 후 다시 시도해 주세요.'));
  };
  const togglePart = (part: string) => {
    setSelectedParts((current) => current.includes(part) ? current.filter((item) => item !== part) : [...current, part]);
  };
  const openSheet = () => {
    if (!session.paused) {
      onTogglePause();
      setResumeAfterSheet(true);
    }
    setChangedCount(null);
    setStopped(false);
    setSheetOpen(true);
  };
  const continueWorkout = () => {
    if (stopped) return; // A stop never resumes; the only way on is ending the workout.
    setSheetOpen(false);
    if (resumeAfterSheet) onTogglePause();
    setResumeAfterSheet(false);
  };
  const submitDiscomfort = async () => {
    if (submitting || needsPart) return;
    // shortcut: ends only on this device, because the discomfort RPC's stop cancels the whole weekly plan; send action_taken=stop once back-end limits it to the current plan_session_id.
    if (chosenFeeling.stops) { setStopped(true); return; }
    setSubmitting(true);
    const changed = await onReportDiscomfort({
      bodyAreas: selectedParts,
      detail: note.trim() || null,
      severity: chosenFeeling.severity,
      symptomType: chosenFeeling.symptomType,
    });
    setSubmitting(false);
    if (changed !== null) setChangedCount(changed);
  };
  const setLabel = (index: number) => {
    const number = index + 1;
    if (exercise.totalSets > 4) return `${number}세트`;
    if (number < session.currentSet || (resting && number === session.currentSet)) return `${number}세트 완료`;
    if (number > session.currentSet) return `${number}세트 남음`;
    return exercise.mode === 'reps' ? `${number}세트 · ${session.currentRep} / ${exercise.targetRepetitions}회` : `${number}세트 진행 중`;
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 4 }]} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="운동 나가기" onPress={onBack} style={s.headerSide}><CaretLeftIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
          <Text style={s.headerTitle}>운동하기</Text>
          <View style={[s.headerSide, s.headerActions]}>
            <Pressable accessibilityRole="button" accessibilityLabel="음성 안내 설정" hitSlop={8} onPress={() => setVoiceOpen(true)}><SpeakerIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={session.paused ? '운동 재개' : '운동 일시정지'} hitSlop={8} onPress={onTogglePause}>
              {session.paused ? <PlayIcon color={colors.textPrimary} height={24} width={24} /> : <PauseIcon color={colors.textPrimary} height={24} width={24} />}
            </Pressable>
          </View>
        </View>
        <View style={s.progressHeading}><Text style={s.progressLabel}>{session.currentExerciseIndex + 1} / {session.exercises.length} 동작</Text><Text style={s.progressLabel}>{time(Math.floor(session.elapsedExerciseMs / 1000))}</Text></View>
        <View style={s.track}><View style={[s.fill, { width: `${progress * 100}%` }]} /></View>
        <Text style={s.exerciseTitle}>{exercise.name}</Text>

        <View style={[s.media, imageUrl ? s.mediaGif : null]}>
          {imageUrl ? <Image accessibilityLabel={`${exercise.name} 동작 시범`} source={{ uri: imageUrl }} resizeMode="contain" style={s.mediaImage} /> : null}
          {videoUrl ? (
            <Pressable accessibilityLabel="동작 영상 보기" accessibilityRole="button" onPress={openVideo} style={s.videoAction}>
              <View style={s.playCircle}><PlayIcon color={colors.textPrimary} height={22} width={22} /></View>
              <Text style={[s.mediaText, imageUrl ? s.mediaTextOnGif : null]}>동작 영상</Text>
            </Pressable>
          ) : !imageUrl ? <Text style={s.mediaText}>동작 영상이 제공되지 않았어요</Text> : null}
          {voice.enabled && exercise.instruction ? (
            <View style={s.caption}>
              <SpeakerIcon color="#FFFFFF" height={16} width={16} />
              <Text numberOfLines={1} style={s.captionText}>{exercise.instruction}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.repArea}>
          {resting ? (
            <>
              <Text style={s.restLabel}>쉬는 중</Text>
              <Text style={s.repNumber}>{time(Math.ceil(session.restRemainingMs / 1000))}</Text>
            </>
          ) : (
            <Text style={s.repNumber}>
              {exercise.mode === 'reps' ? session.currentRep : time(Math.ceil(session.setRemainingMs / 1000))}
              {exercise.mode === 'reps' ? <Text style={s.repTotal}>  / {exercise.targetRepetitions}회</Text> : null}
            </Text>
          )}
          <Text style={s.setText}>총 {exercise.totalSets}세트{exercise.restSeconds ? ` · 세트 사이 쉬기 ${exercise.restSeconds}초` : ''}</Text>
        </View>
        <View style={s.setBars}>
          {Array.from({ length: exercise.totalSets }, (_, index) => {
            const number = index + 1;
            const done = number < session.currentSet || (resting && number === session.currentSet);
            const ratio = done ? 1 : number === session.currentSet ? setProgress : 0;
            return (
              <View key={index} style={s.setBar}>
                <View style={s.setTrack}><View style={[s.fill, { width: `${ratio * 100}%` }]} /></View>
                <View style={s.setLabelRow}>
                  {done ? <CheckIcon color={colors.textSecondary} height={14} width={14} /> : null}
                  <Text numberOfLines={1} style={[s.setLabel, number === session.currentSet && !done && s.setLabelNow]}>{setLabel(index)}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={s.tipCard}>
          <InfoIcon color={colors.textPrimary} height={20} width={20} />
          <View style={s.grow}>
            <Text style={s.cardTitle}>자세 팁</Text>
            <Text style={s.cardText}>{exercise.instruction ?? '무리하지 않고 천천히 움직여 주세요.'}</Text>
          </View>
        </View>
        <View style={s.nextCard}>
          <View style={s.nextIcon}><BarbellIcon color={colors.textPrimary} height={22} width={22} /></View>
          <View style={s.grow}>
            <Text numberOfLines={1} style={s.nextTitle}>{next ? `다음 · ${next.name}` : '마지막 동작이에요'}</Text>
            {next?.prescription ? <Text numberOfLines={1} style={s.cardText}>{next.prescription}</Text> : null}
          </View>
          <Pressable accessibilityLabel="이 동작 건너뛰기" accessibilityRole="button" onPress={onSkip} style={s.smallButton}><Text style={s.smallButtonText}>건너뛰기</Text></Pressable>
        </View>
      </ScrollView>
      <View style={[s.actions, s.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        {resting ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => onAddRest(10)} style={s.secondaryButton}><Text style={s.secondaryText}>+10초</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onSkipRest} style={s.primaryButton}><Text style={s.primaryText}>건너뛰기</Text></Pressable>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="button" onPress={openSheet} style={s.secondaryButton}><Text style={s.secondaryText}>몸이 불편해요</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onCompleteSet} style={s.primaryButton}><Text style={s.primaryText}>세트 완료</Text></Pressable>
          </>
        )}
      </View>

      <Modal animationType="slide" onRequestClose={continueWorkout} transparent visible={sheetOpen}>
        <View style={s.sheetOverlay}>
          <Pressable accessibilityLabel="닫기" accessibilityRole="button" onPress={continueWorkout} style={s.sheetDim} />
          <View style={[s.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <View style={s.sheetHeading}>
              <Text style={s.sheetTitle}>{stopped ? '운동을 멈췄어요' : changedCount === null ? '어디가 불편했나요?' : '알려 주셔서 고마워요'}</Text>
              {stopped ? null : <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={10} onPress={continueWorkout}><XIcon color={colors.textPrimary} height={24} width={24} /></Pressable>}
            </View>
            {stopped ? (
              <>
                <View style={s.notice}>
                  <WarningIcon color={colors.warning} height={20} width={20} />
                  <View style={s.grow}>
                    <Text style={s.noticeTitle}>증상에 따라 안전을 위해 중단했어요</Text>
                    <Text style={s.cardText}>증상이 계속되거나 심해지면 의료진과 상담해 주세요.</Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" onPress={onStopWorkout} style={s.sheetPrimary}><Text style={s.primaryText}>운동 종료</Text></Pressable>
              </>
            ) : changedCount !== null ? (
              <>
                <Text style={s.sheetDescription}>{changedCount > 0 ? `남은 운동 ${changedCount}개를 몸 상태에 맞게 바꿨어요.` : '바꿀 남은 운동은 없어요. 무리되면 언제든 멈춰 주세요.'}</Text>
                <Pressable accessibilityRole="button" onPress={continueWorkout} style={s.sheetPrimary}><Text style={s.primaryText}>운동 이어 하기</Text></Pressable>
              </>
            ) : (
              <>
                <Text style={s.sheetDescription}>운동은 잠시 멈춰 있어요.</Text>
                <View style={s.notice}>
                  <WarningIcon color={colors.warning} height={20} width={20} />
                  <View style={s.grow}>
                    <Text style={s.noticeTitle}>통증이 심하면</Text>
                    <Text style={s.cardText}>바로 멈추고 전문가와 상담해 주세요.</Text>
                  </View>
                </View>
                <Text style={s.fieldTitle}>불편한 곳 <Text style={s.optional}>여러 개 고를 수 있어요</Text></Text>
                <View style={s.chips}>{parts.map((part) => (
                  <Pressable key={part} accessibilityRole="button" accessibilityState={{ selected: selectedParts.includes(part) }} onPress={() => togglePart(part)} style={[s.chip, selectedParts.includes(part) && s.selectedChip]}>
                    <Text style={[s.chipText, selectedParts.includes(part) && s.selectedChipText]}>{part}</Text>
                  </Pressable>
                ))}</View>
                <Text style={s.fieldTitle}>어떤 느낌인가요?</Text>
                <View style={s.chips}>{feelings.map(({ key, label }) => (
                  <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: feeling === key }} onPress={() => setFeeling(key)} style={[s.chip, feeling === key && s.selectedChip]}>
                    <Text style={[s.chipText, feeling === key && s.selectedChipText]}>{label}</Text>
                  </Pressable>
                ))}</View>
                <TextInput accessibilityLabel="불편한 내용" maxLength={200} onChangeText={setNote} placeholder="예) 당길 때 오른쪽 어깨가 찌릿해요 (선택)" placeholderTextColor={colors.textDisabled} style={s.input} value={note} />
                <View style={s.actions}>
                  {chosenFeeling.stops ? null : <Pressable accessibilityRole="button" onPress={() => { setSheetOpen(false); setResumeAfterSheet(false); onBack(); }} style={s.secondaryButton}><Text style={s.secondaryText}>오늘은 그만하기</Text></Pressable>}
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting || needsPart }} disabled={submitting || needsPart} onPress={() => void submitDiscomfort()} style={[s.primaryButton, (submitting || needsPart) && s.disabled]}><Text style={[s.primaryText, (submitting || needsPart) && s.disabledText]}>{submitting ? '바꾸는 중…' : chosenFeeling.stops ? '운동 중단하기' : '남은 운동 강도 낮추기'}</Text></Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" onRequestClose={() => setVoiceOpen(false)} transparent visible={voiceOpen}>
        <View style={s.sheetOverlay}><Pressable accessibilityLabel="닫기" accessibilityRole="button" onPress={() => setVoiceOpen(false)} style={s.sheetDim} />
          <View style={[s.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <Text style={s.sheetTitle}>음성 안내</Text>
            {([['enabled', '음성 안내', '동작 방법과 자세 팁을 말로 알려 줘요'], ['countReps', '횟수 세어 주기', '반복 횟수를 소리 내어 세요'], ['announceRest', '쉬는 시간 알려 주기', '쉬는 시간이 되면 알려 줘요']] as const).map(([key, title, detail]) => (
              <Pressable key={key} accessibilityRole="switch" accessibilityState={{ checked: voice[key] }} onPress={() => updateVoice({ [key]: !voice[key] })} style={s.voiceRow}>
                <View style={s.grow}><Text style={s.voiceTitle}>{title}</Text><Text style={s.smallText}>{detail}</Text></View>
                <View style={[s.switch, voice[key] && s.switchOn]}><View style={[s.switchThumb, voice[key] && s.switchThumbOn]} /></View>
              </Pressable>
            ))}
            <Text style={s.fieldTitle}>목소리</Text>
            <View style={s.chips}><View style={[s.chip, s.selectedChip]}><Text style={[s.chipText, s.selectedChipText]}>기기 기본 음성</Text></View></View>
            <Text style={s.fieldTitle}>말 빠르기</Text>
            <View style={s.feelings}>{([['slow', '천천히'], ['normal', '보통'], ['fast', '빠르게']] as const).map(([key, label]) => (
              <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: voice.speed === key }} onPress={() => updateVoice({ speed: key })} style={[s.chip, s.feeling, voice.speed === key && s.selectedChip]}>
                <Text style={[s.chipText, voice.speed === key && s.selectedChipText]}>{label}</Text>
              </Pressable>
            ))}</View>
            <Pressable accessibilityRole="button" onPress={() => setVoiceOpen(false)} style={s.sheetPrimary}><Text style={s.primaryText}>완료</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createSStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
    grow: { flex: 1, minWidth: 0 },
    header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
    headerSide: { width: 64, justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, textAlign: 'center' },
    headerActions: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'flex-end' },
    progressHeading: { flexDirection: 'row', justifyContent: 'space-between' }, progressLabel: { fontSize: 14, color: colors.textSecondary },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.gaugeTrack, overflow: 'hidden' },
    fill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
    exerciseTitle: { color: colors.textPrimary, fontSize: 22, lineHeight: 30, fontFamily: fontFamilies.pretendardBold, marginTop: 4 },
    media: { height: 180, borderRadius: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    mediaImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
    // The demo GIFs have a white background baked in, so the card is white in both modes.
    mediaGif: { backgroundColor: lightPalette.background, borderColor: lightPalette.border },
    mediaTextOnGif: { color: lightPalette.textSecondary },
    videoAction: { alignItems: 'center', gap: 6 },
    playCircle: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
    mediaText: { color: colors.textSecondary, fontSize: 14 },
    caption: { alignItems: 'center', backgroundColor: 'rgba(23,22,29,0.75)', borderRadius: 999, bottom: 10, flexDirection: 'row', gap: 6, left: 12, paddingHorizontal: 12, paddingVertical: 6, position: 'absolute', right: 12 },
    captionText: { color: '#FFFFFF', flex: 1, fontSize: 14 },
    repArea: { alignItems: 'center', paddingTop: 4 },
    restLabel: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    repNumber: { color: colors.textPrimary, fontSize: 64, lineHeight: 76, fontFamily: fontFamilies.pretendardBold },
    repTotal: { color: colors.textSecondary, fontSize: 18, fontFamily: fontFamilies.pretendardMedium }, setText: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    setBars: { flexDirection: 'row', gap: 6 }, setBar: { flex: 1, gap: 4, minWidth: 0 },
    setTrack: { height: 8, borderRadius: 4, backgroundColor: colors.gaugeTrack, overflow: 'hidden' },
    setLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    setLabel: { color: colors.textSecondary, flexShrink: 1, fontSize: 12 }, setLabelNow: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium },
    tipCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, flexDirection: 'row', gap: 8, padding: 14 },
    cardTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 21, fontFamily: fontFamilies.pretendardMedium }, cardText: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    nextCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, flexDirection: 'row', gap: 10, padding: 14 },
    nextIcon: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
    nextTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 24, fontFamily: fontFamilies.pretendardBold },
    smallButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    smallButtonText: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    actions: { flexDirection: 'row', gap: 8 }, footer: { paddingHorizontal: 20, paddingTop: 8 },
    secondaryButton: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
    secondaryText: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    primaryButton: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    primaryText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold }, disabled: { backgroundColor: colors.surfaceMuted }, disabledText: { color: colors.textDisabled },
    sheetPrimary: { height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
    sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sheetTitle: { color: colors.textPrimary, fontSize: 18, lineHeight: 26, fontFamily: fontFamilies.pretendardBold },
    sheetDescription: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    notice: { alignItems: 'flex-start', backgroundColor: colors.warningLight, borderRadius: 16, flexDirection: 'row', gap: 8, padding: 14 },
    noticeTitle: { color: colors.warning, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    fieldTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 21, fontFamily: fontFamilies.pretendardBold },
    optional: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
    selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textBody, fontSize: 14, fontFamily: fontFamilies.pretendardMedium }, selectedChipText: { color: '#FFF' },
    feelings: { flexDirection: 'row', gap: 8 }, feeling: { flex: 1, paddingHorizontal: 4 },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.textPrimary, fontSize: 16, height: 52, paddingHorizontal: 16 },
    voiceRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 },
    voiceTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 24, fontFamily: fontFamilies.pretendardBold }, smallText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    switch: { width: 46, height: 28, backgroundColor: colors.border, borderRadius: 14, padding: 3 }, switchOn: { backgroundColor: colors.primary }, switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background }, switchThumbOn: { alignSelf: 'flex-end' },
  } as const;
}
