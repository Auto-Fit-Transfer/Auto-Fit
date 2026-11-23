import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  type FontVariant,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import SpeakerIcon from '@/assets/icons/system/SpeakerSimpleHigh.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import PauseIcon from '@/assets/icons/ui/pause-fill.svg';
import PlayIcon from '@/assets/icons/ui/play-fill.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import XIcon from '@/assets/icons/ui/x.svg';
import { discomfortFeelings as feelings } from '@/src/features/exercise/discomfortFeelings';
import type { ExerciseSessionExercise, ExerciseSessionState } from '@/src/features/exercise/ExerciseSessionContext';
import { defaultVoiceGuideSettings, loadVoiceGuideSettings, saveVoiceGuideSettings, speakGuide, stopGuide, type VoiceGuideSettings } from '@/src/features/exercise/voiceGuide';
import { msToFirstMinute } from '@/src/features/exercise/savedRoutine';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';
import { aForm } from '@/src/components/a/form';

const parts = ['목', '어깨', '허리', '무릎', '손목', '발목', '기타'];
const SPEEDS = { slow: '느리게', normal: '보통', fast: '빠르게' } as const;
const RING = 176;
const ARC = Math.PI * (RING - 12);
const TABULAR: FontVariant[] = ['tabular-nums'];

export type DiscomfortReport = {
  bodyAreas: string[];
  detail: string | null;
  severity: number | null;
  symptomType: 'fatigue' | 'pain' | 'dizziness' | 'breathing';
};

type Props = {
  exercise: ExerciseSessionExercise;
  session: ExerciseSessionState;
  // How fast the count goes: slow, normal, fast in turn.
  onCycleSpeed: () => void;
  onAddRest: (seconds: number) => void;
  onBack: () => void;
  onCompleteSet: () => void;
  // Resolves to how many remaining items changed, or null when the report failed.
  onReportDiscomfort?: (report: DiscomfortReport) => Promise<number | null>; // absent: the workout cannot be lightened (a saved routine)
  // Records a high-risk stop; the safety notice shows at once, but '운동 종료' waits for the server (true = stopped).
  onReportStop: (report: DiscomfortReport) => Promise<boolean>;
  onRetryStop: (report: DiscomfortReport) => Promise<boolean>;
  onSkip: () => void;
  onSkipRest: () => void;
  onStopWorkout: () => void;
  onTogglePause: () => void;
};

function time(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function R6ExerciseSession({
  exercise, session, onAddRest, onBack, onCycleSpeed, onCompleteSet, onReportDiscomfort, onReportStop, onRetryStop, onSkip, onSkipRest, onStopWorkout, onTogglePause,
}: Props) {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const insets = useSafeAreaInsets();
  // A shorter phone gets a flatter demo, so the count and the buttons stay on the first screen (as the design does).
  const { height } = useWindowDimensions();
  const demoRatio = height < 790 ? 5 / 2 : height < 880 ? 2 : 16 / 9;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resumeAfterSheet, setResumeAfterSheet] = useState(false);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<(typeof feelings)[number]['key']>('tingling');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changedCount, setChangedCount] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  // The server's answer to the stop: '운동 종료' only clears the workout once it is 'done'.
  const [stopSend, setStopSend] = useState<{ state: 'sending' | 'done' | 'failed'; report: DiscomfortReport } | null>(null);
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
    setStopSend(null);
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
    const report = {
      bodyAreas: selectedParts,
      detail: note.trim() || null,
      severity: chosenFeeling.severity,
      symptomType: chosenFeeling.symptomType,
    };
    if (chosenFeeling.stops) {
      setStopped(true);
      setStopSend({ state: 'sending', report });
      const ok = await onReportStop(report);
      setStopSend({ state: ok ? 'done' : 'failed', report });
      return;
    }
    if (!onReportDiscomfort) return;
    setSubmitting(true);
    const changed = await onReportDiscomfort(report);
    setSubmitting(false);
    if (changed !== null) setChangedCount(changed);
  };
  const total = session.exercises.length;
  const restSeconds = Math.ceil(session.restRemainingMs / 1000);
  const lastThree = resting && restSeconds <= 3;
  const hasDemo = Boolean(imageUrl || videoUrl);
  // What the finished moves burned, as the server's routine estimates each of them.
  const burned = session.results.reduce((sum, result) => sum + (result.caloriesBurned ?? 0), 0);
  // For a moment after a move's last set, the voice line says it is done; a move that was skipped gets none.
  const [cleared, setCleared] = useState<string | null>(null);
  // A saved routine's last set cannot finish before 1 recorded minute: the tip says how long is left.
  const lastSet = session.phase === 'exercise' && session.currentSet >= exercise.totalSets;
  const minuteLeft = lastSet ? Math.ceil(msToFirstMinute(Boolean(session.savedRoutine), session.elapsedExerciseMs) / 1000) : 0;
  const before = useRef({ index: session.currentExerciseIndex, name: exercise.name });
  useEffect(() => {
    const was = before.current;
    before.current = { index: session.currentExerciseIndex, name: exercise.name };
    if (session.currentExerciseIndex <= was.index || session.results[session.results.length - 1]?.skipped) return undefined;
    const show = setTimeout(() => setCleared(`${was.name} 끝냈어요. 다음은 ${exercise.name}`), 0);
    return () => clearTimeout(show);
  }, [exercise.name, session.currentExerciseIndex, session.results, total]);
  useEffect(() => {
    if (!cleared) return undefined;
    const hide = setTimeout(() => setCleared(null), 2400);
    return () => clearTimeout(hide);
  }, [cleared]);

  // The whole routine's progress, set by set: a skipped move counts as passed.
  const allSets = session.exercises.reduce((sum, item) => sum + item.totalSets, 0);
  const setsBefore = session.exercises.slice(0, session.currentExerciseIndex).reduce((sum, item) => sum + item.totalSets, 0);
  const setsDone = setsBefore + session.currentSet - 1 + (resting ? 1 : setProgress);
  const ring = resting ? 1 - session.restRemainingMs / Math.max(1, session.restTotalMs) : setProgress;
  const say = minuteLeft
    ? `1분을 채워야 기록돼요. ${minuteLeft}초 더 이어서 해 주세요. 그만하려면 건너뛰기를 눌러요.`
    : cleared ?? exercise.instruction ?? '무리하지 않고 천천히 움직여 주세요.';

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
        <View style={s.bar}>
          <Pressable accessibilityLabel="운동 나가기" accessibilityRole="button" onPress={onBack} style={s.round}><CaretLeftIcon color={colors.textPrimary} height={22} width={22} /></Pressable>
          <View style={s.grow} />
          <Pressable accessibilityLabel="음성 안내 설정" accessibilityRole="button" onPress={() => setVoiceOpen(true)} style={s.round}><SpeakerIcon color={colors.textPrimary} height={22} width={22} /></Pressable>
          <Pressable accessibilityLabel={session.paused ? '운동 재개' : '운동 일시정지'} accessibilityRole="button" onPress={onTogglePause} style={[s.round, session.paused && s.roundOn]}>
            {session.paused ? <PlayIcon color={colors.onPrimary} height={22} width={22} /> : <PauseIcon color={colors.textPrimary} height={22} width={22} />}
          </Pressable>
        </View>
        <View style={s.sub}>
          <Text accessibilityRole="header" numberOfLines={1} style={s.subNow}>
            {session.currentExerciseIndex + 1} / {total} 동작<Text style={s.subNext}>{next ? `   다음 ${next.name}` : '   마지막 동작'}</Text>
          </Text>
          <Text style={s.subTime}>{time(Math.floor(session.elapsedExerciseMs / 1000))}</Text>
        </View>
        <View style={s.prog}><View style={[s.progFill, { width: `${Math.min(1, setsDone / Math.max(1, allSets)) * 100}%` }]} /></View>
        <Text numberOfLines={2} style={s.move}>{exercise.name}</Text>

        {hasDemo ? (
          <View style={[s.stage, { aspectRatio: demoRatio }]}>
            {imageUrl ? <Image accessibilityLabel={`${exercise.name} 동작 시범`} source={{ uri: imageUrl }} resizeMode="contain" style={s.mediaImage} /> : null}
            {videoUrl ? (
              <Pressable accessibilityLabel="동작 영상 보기" accessibilityRole="button" onPress={openVideo} style={s.videoAction}>
                <View style={s.playCircle}><PlayIcon color={colors.onPrimary} height={20} width={20} /></View>
                <Text style={s.mediaText}>동작 영상</Text>
              </Pressable>
            ) : null}
            {session.paused ? <View style={s.paused}><Text style={s.pausedText}>잠시 멈췄어요</Text></View> : null}
          </View>
        ) : null}
        {/* The tip, or what was just finished: the voice line under the demo. */}
        <View style={s.say}>
          <SpeakerIcon color={colors.lilac} height={18} width={18} />
          <Text accessibilityLiveRegion="polite" style={s.sayText}>{say}</Text>
        </View>

        <View accessibilityLabel={resting ? `${restSeconds}초 쉬는 중` : '이번 세트에서 한 횟수'} accessible style={[s.ringBox, session.paused && !hasDemo && s.held]}>
          <Svg height={RING} style={s.ringSvg} width={RING}>
            <Circle cx={RING / 2} cy={RING / 2} fill="none" r={RING / 2 - 6} stroke={colors.surfaceMuted} strokeWidth={9} />
            <Circle cx={RING / 2} cy={RING / 2} fill="none" r={RING / 2 - 6} stroke={colors.textPrimary} strokeDasharray={`${ARC} ${ARC}`} strokeDashoffset={ARC * (1 - Math.min(1, Math.max(0, ring)))} strokeLinecap="round" strokeWidth={9} />
          </Svg>
          <View style={s.ringText}>
            <Text style={s.big}>{resting ? restSeconds : exercise.mode === 'reps' ? session.currentRep : time(Math.ceil(session.setRemainingMs / 1000))}</Text>
            <Text style={s.bigUnit}>{resting ? (lastThree ? '초 뒤 시작' : '초 쉬는 중') : exercise.mode === 'reps' ? `/ ${exercise.targetRepetitions}회` : '남음'}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <Text style={s.metaText}>
            {burned > 0 ? <>지금까지 <Text style={s.metaBold}>약 {Math.round(burned).toLocaleString('ko-KR')}kcal</Text></> : `세트 사이 쉬기 ${exercise.restSeconds ?? 0}초`}
          </Text>
          {resting ? (
            <Pressable accessibilityLabel="쉬는 시간 10초 늘리기" accessibilityRole="button" hitSlop={6} onPress={() => onAddRest(10)} style={s.mini}><Text style={s.miniText}>쉬는 시간 <Text style={s.metaBold}>+10초</Text></Text></Pressable>
          ) : exercise.mode === 'reps' ? (
            <Pressable accessibilityLabel={`운동 속도 ${SPEEDS[session.countSpeed]}, 바꾸기`} accessibilityRole="button" hitSlop={6} onPress={onCycleSpeed} style={s.mini}>
              <Text style={s.miniText}>운동 속도 <Text style={s.metaBold}>{SPEEDS[session.countSpeed]}</Text></Text>
            </Pressable>
          ) : null}
        </View>
        {/* This move's sets: black when done, filling for the one I am on. */}
        <View style={s.sets}>
          {Array.from({ length: exercise.totalSets }, (_, set) => {
            const number = set + 1;
            const done = number < session.currentSet || (resting && number === session.currentSet);
            const now = !resting && number === session.currentSet;
            const amount = exercise.mode === 'reps' ? `${session.currentRep}/${exercise.targetRepetitions ?? 0}회` : '';
            return (
              <View key={set} style={s.setItem}>
                <View style={s.setTrack}><View style={[s.setFill, { width: done ? '100%' : now ? `${setProgress * 100}%` : '0%' }]} /></View>
                <Text numberOfLines={1} style={[s.setLabel, now && s.setLabelNow]}>{done ? `${number}세트 완료` : now ? `${number}세트${amount ? ` · ${amount}` : ''}` : `${number}세트 남음`}</Text>
              </View>
            );
          })}
        </View>
        {resting ? null : (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onSkip} style={s.skip}><Text style={s.skipText}>이 동작 건너뛰기</Text></Pressable>
        )}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable accessibilityRole="button" onPress={openSheet} style={s.secondaryButton}><Text style={s.secondaryText}>몸이 불편해요</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={resting ? onSkipRest : onCompleteSet} style={s.primaryButton}>
          <Text style={s.primaryText}>{resting ? '쉬는 시간 건너뛰기' : '세트 완료'}</Text>
        </Pressable>
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
                    <Text style={s.cardText}>즉시 운동을 멈추고 넘어지지 않도록 앉거나 편한 자세를 취해 주세요. 증상이 심하거나 계속되면 의료진과 상담해 주세요. 가슴 통증·압박, 실신할 것 같은 느낌, 의식 변화 또는 말하기 힘들 정도의 호흡곤란이 있으면 주변에 도움을 요청하고 119에 연락해 주세요.</Text>
                  </View>
                </View>
                {stopSend?.state === 'failed' ? <Text accessibilityLiveRegion="polite" style={s.cardText}>운동 중단을 서버에 저장하지 못했어요. 다시 시도해 주세요.</Text> : null}
                {stopSend?.state === 'failed' ? (
                  <Pressable accessibilityRole="button" onPress={() => { const { report } = stopSend; setStopSend({ state: 'sending', report }); void onRetryStop(report).then((ok) => setStopSend({ state: ok ? 'done' : 'failed', report })); }} style={s.sheetPrimary}><Text style={s.primaryText}>다시 시도</Text></Pressable>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: stopSend?.state !== 'done' }} disabled={stopSend?.state !== 'done'} onPress={onStopWorkout} style={[s.sheetPrimary, stopSend?.state !== 'done' && s.disabled]}><Text style={[s.primaryText, stopSend?.state !== 'done' && s.disabledText]}>{stopSend?.state === 'done' ? '운동 종료' : '저장하는 중…'}</Text></Pressable>
                )}
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
                  {chosenFeeling.stops || onReportDiscomfort ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting || needsPart }} disabled={submitting || needsPart} onPress={() => void submitDiscomfort()} style={[s.primaryButton, (submitting || needsPart) && s.disabled]}><Text style={[s.primaryText, (submitting || needsPart) && s.disabledText]}>{submitting ? '바꾸는 중…' : chosenFeeling.stops ? '운동 중단하기' : '남은 운동 강도 낮추기'}</Text></Pressable> : null}
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
  // Renewal B (exercise.src.html #vRun): no outlines, the demo in a white card, the tip as the black voice
  // line, one ring for the count, the sets as thin bars, two pill buttons at the bottom.
  const a = aForm(colors);
  const b13 = { fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 } as const;
  const pill = { alignItems: 'center', borderRadius: 999, height: 54, justifyContent: 'center', paddingHorizontal: 12 } as const;
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { flexGrow: 1, gap: 10, paddingBottom: 12, paddingHorizontal: 20 },
    grow: { flex: 1, minWidth: 0 },
    bar: { alignItems: 'center', flexDirection: 'row', gap: 8, height: 48 },
    round: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    roundOn: { backgroundColor: colors.primary },
    sub: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    subNow: { ...b13, color: colors.textPrimary, flexShrink: 1 },
    subNext: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium },
    subTime: { ...b13, color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontVariant: TABULAR },
    prog: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 5, marginTop: -4, overflow: 'hidden' },
    progFill: { backgroundColor: colors.textPrimary, borderRadius: 3, height: '100%' },
    move: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 26, lineHeight: 34 },
    // The demo GIFs have a white background baked in, so the card is white in both themes.
    stage: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 28, justifyContent: 'center', overflow: 'hidden' },
    mediaImage: { ...StyleSheet.absoluteFill, height: '100%', width: '100%' },
    videoAction: { alignItems: 'center', gap: 6 },
    playCircle: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
    mediaText: { ...a.p12, color: '#6A6B76' },
    paused: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.82)', justifyContent: 'center' },
    pausedText: { color: '#010101', fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 30 },
    say: { alignItems: 'center', backgroundColor: colors.aiCard, borderRadius: 24, flexDirection: 'row', gap: 10, minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
    sayText: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 20 },
    ringBox: { alignItems: 'center', alignSelf: 'center', height: RING, justifyContent: 'center', width: RING },
    ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
    ringText: { alignItems: 'center' },
    held: { opacity: 0.35 },
    big: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 64, fontVariant: TABULAR, lineHeight: 70 },
    bigUnit: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    meta: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 34 },
    metaText: { ...a.p12, color: colors.textSecondary, flexShrink: 1 },
    metaBold: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    mini: { ...a.mini, backgroundColor: colors.surface },
    miniText: { ...a.p12, color: colors.textSecondary },
    sets: { flexDirection: 'row', gap: 6 },
    setItem: { flex: 1, gap: 5, minWidth: 0 },
    setTrack: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 5, overflow: 'hidden' },
    setFill: { backgroundColor: colors.textPrimary, height: '100%' },
    setLabel: { color: colors.textSecondary, fontSize: 11.5, fontVariant: TABULAR, lineHeight: 16 },
    setLabelNow: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    skip: { alignItems: 'center', alignSelf: 'center', justifyContent: 'center', minHeight: 36 },
    skipText: { ...a.link, color: colors.textSecondary },
    footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 8 },
    // the sheets: light grey chips, black for what is chosen, pill buttons
    cardText: { ...a.p12, color: colors.textSecondary },
    actions: { flexDirection: 'row', gap: 8 },
    secondaryButton: { ...pill, backgroundColor: colors.surface, flex: 1 },
    secondaryText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    primaryButton: { ...pill, backgroundColor: colors.primary, flex: 1.4 },
    primaryText: a.goText,
    disabled: { backgroundColor: colors.surfaceMuted },
    disabledText: { color: colors.textDisabled },
    sheetPrimary: { ...pill, backgroundColor: colors.primary },
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12, padding: 22 },
    sheetHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    sheetTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 30 },
    sheetDescription: { ...a.p15, color: colors.textSecondary },
    notice: { alignItems: 'flex-start', backgroundColor: colors.warningLight, borderRadius: 20, flexDirection: 'row', gap: 8, padding: 14 },
    noticeTitle: { ...a.p15, color: colors.warning, fontFamily: fontFamilies.pretendardBold },
    fieldTitle: { ...a.p15, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    optional: { ...a.p12, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { ...a.chip, height: 40, paddingHorizontal: 14 },
    selectedChip: a.on,
    chipText: a.chipText,
    selectedChipText: a.onText,
    feelings: { flexDirection: 'row', gap: 8 },
    feeling: { flex: 1, paddingHorizontal: 4 },
    input: { ...a.field, ...a.input, height: 46 },
    voiceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 52 },
    voiceTitle: { ...a.p15, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    smallText: { ...a.p12, color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
    switch: { backgroundColor: colors.surfaceMuted, borderRadius: 14, height: 28, padding: 3, width: 46 },
    switchOn: { backgroundColor: colors.primary },
    switchThumb: { backgroundColor: colors.surface, borderRadius: 11, height: 22, width: 22 },
    switchThumbOn: { alignSelf: 'flex-end' },
  } as const;
}
