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
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import PauseIcon from '@/assets/icons/ui/pause-fill.svg';
import PlayIcon from '@/assets/icons/ui/play-fill.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import XIcon from '@/assets/icons/ui/x.svg';
import { HeroHead, type Who } from '@/src/components/a/sprites';
import { discomfortFeelings as feelings } from '@/src/features/exercise/discomfortFeelings';
import type { ExerciseSessionExercise, ExerciseSessionState } from '@/src/features/exercise/ExerciseSessionContext';
import tips from '@/src/features/exercise/exerciseTips.json';
import { setTip, type TipLines } from '@/src/features/exercise/exerciseTips';
import { defaultVoiceGuideSettings, loadVoiceGuideSettings, saveVoiceGuideSettings, speakGuide, stopGuide, type VoiceGuideSettings } from '@/src/features/exercise/voiceGuide';
import { msToFirstMinute } from '@/src/features/exercise/savedRoutine';
import { fontFamilies, lightPalette, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

const parts = ['목', '어깨', '허리', '무릎', '손목', '발목', '기타'];
const SPEEDS = { slow: '느리게', normal: '보통', fast: '빠르게' } as const;

export type DiscomfortReport = {
  bodyAreas: string[];
  detail: string | null;
  severity: number | null;
  symptomType: 'fatigue' | 'pain' | 'dizziness' | 'breathing';
};

type Props = {
  exercise: ExerciseSessionExercise;
  session: ExerciseSessionState;
  // My character's face says the tip under the demo.
  who: Who;
  tierIndex: number;
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
  exercise, session, who, tierIndex, onAddRest, onBack, onCycleSpeed, onCompleteSet, onReportDiscomfort, onReportStop, onRetryStop, onSkip, onSkipRest, onStopWorkout, onTogglePause,
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
    const tip = setTip(exercise.exerciseKey ? (tips as Record<string, TipLines>)[exercise.exerciseKey] : undefined, session.currentSet, exercise.sets);
    if (newExercise) speakGuide(`${exercise.name}. ${tip ?? exercise.instruction ?? ''}`, voice);
    else if (session.currentRep === 0) { if (tip) speakGuide(tip, voice); }
    else if (voice.countReps && exercise.mode === 'reps') speakGuide(`${session.currentRep}회`, voice, true);
  }, [exercise.name, exercise.instruction, exercise.exerciseKey, exercise.sets, exercise.mode, resting, session.currentExerciseIndex, session.currentSet, session.currentRep, session.paused, voice, voiceOpen, sheetOpen]);
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
  // "클리어!" for a moment when a move's last set is done; a move that was skipped gets none.
  const [cleared, setCleared] = useState<string | null>(null);
  // A saved routine's last set cannot finish before 1 recorded minute: the tip says how long is left.
  const lastSet = session.phase === 'exercise' && session.currentSet >= exercise.totalSets;
  const minuteLeft = lastSet ? Math.ceil(msToFirstMinute(Boolean(session.savedRoutine), session.elapsedExerciseMs) / 1000) : 0;
  const before = useRef({ index: session.currentExerciseIndex, name: exercise.name });
  useEffect(() => {
    const was = before.current;
    before.current = { index: session.currentExerciseIndex, name: exercise.name };
    if (session.currentExerciseIndex <= was.index || session.results[session.results.length - 1]?.skipped) return undefined;
    const show = setTimeout(() => setCleared(`${was.name} · ${was.index + 1} / ${total} 동작`), 0);
    return () => clearTimeout(show);
  }, [exercise.name, session.currentExerciseIndex, session.results, total]);
  useEffect(() => {
    if (!cleared) return undefined;
    const hide = setTimeout(() => setCleared(null), 1400);
    return () => clearTimeout(hide);
  }, [cleared]);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
        <View style={s.bar}>
          <Pressable accessibilityLabel="운동 나가기" accessibilityRole="button" onPress={onBack} style={s.round}><CaretLeftIcon color={colors.ink} height={22} width={22} /></Pressable>
          <Text accessibilityRole="header" style={s.heading}>{session.currentExerciseIndex + 1} / {total} 동작</Text>
          <Pressable accessibilityLabel="음성 안내 설정" accessibilityRole="button" onPress={() => setVoiceOpen(true)} style={s.round}><SpeakerIcon color={colors.ink} height={22} width={22} /></Pressable>
          <Pressable accessibilityLabel={session.paused ? '운동 재개' : '운동 일시정지'} accessibilityRole="button" onPress={onTogglePause} style={s.round}>
            {session.paused ? <PlayIcon color={colors.ink} height={22} width={22} /> : <PauseIcon color={colors.ink} height={22} width={22} />}
          </Pressable>
        </View>
        <View style={s.meta}>
          <Text style={s.cardText}>{time(Math.floor(session.elapsedExerciseMs / 1000))}</Text>
          <Text numberOfLines={1} style={[s.cardText, s.metaNext]}>{next ? `다음 ${next.name}` : '마지막 동작이에요'}</Text>
        </View>
        {/* Every set of the routine as a cell: violet when done, gold for the one I am on. */}
        <View style={s.stage}>
          {session.exercises.flatMap((item, index) => {
            const skipped = session.results.some((result) => result.sessionItemId === item.sessionItemId && result.skipped);
            return Array.from({ length: item.totalSets }, (_, set) => {
              const number = set + 1;
              const here = index === session.currentExerciseIndex;
              const done = index < session.currentExerciseIndex || (here && (number < session.currentSet || (resting && number === session.currentSet)));
              const now = here && !done && number === session.currentSet + (resting ? 1 : 0);
              return <View key={`${item.sessionItemId}-${set}`} style={[s.stageCell, set === 0 && index > 0 && s.stageGap, done && s.stageDone, skipped && s.stageSkip, now && s.stageNow]} />;
            });
          })}
        </View>

        {/* Without a demo there is little here: it sits as one block a little above the middle. */}
        <View style={s.body}>
        <View style={s.demo}>
          {hasDemo ? (
            <View style={s.demoBox}>
              {imageUrl ? <Image accessibilityLabel={`${exercise.name} 동작 시범`} source={{ uri: imageUrl }} resizeMode="contain" style={s.mediaImage} /> : null}
              {videoUrl ? (
                <Pressable accessibilityLabel="동작 영상 보기" accessibilityRole="button" onPress={openVideo} style={s.videoAction}>
                  <View style={s.playCircle}><PlayIcon color={colors.ink} height={22} width={22} /></View>
                  <Text style={[s.mediaText, imageUrl ? s.mediaTextOnGif : null]}>동작 영상</Text>
                </Pressable>
              ) : null}
              {cleared ? (
                <View accessibilityLiveRegion="polite" style={s.clear}>
                  <Text style={s.clearBig}>클리어!</Text>
                  <Text style={s.clearSub}>{cleared}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {/* The tip, said by my character. Without a demo the card is this line only, and "클리어!" shows here. */}
          <View style={[s.cap, hasDemo && s.capLine]}>
            {cleared && !hasDemo ? (
              <Text accessibilityLiveRegion="polite" style={s.clearInline}>클리어!  <Text style={s.cardText}>{cleared}</Text></Text>
            ) : (
              <>
                <View style={s.face}><HeroHead tier={tierIndex} who={who} /></View>
                <Text accessibilityLiveRegion={minuteLeft ? 'polite' : 'none'} style={s.capText}>
                  {minuteLeft ? `1분을 채워야 기록돼요. ${minuteLeft}초 더 이어서 해 주세요. 그만하려면 건너뛰기를 눌러요.` : exercise.instruction ?? '무리하지 않고 천천히 움직여 주세요.'}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={s.now}>
          <Text numberOfLines={1} style={s.move}>{exercise.name}</Text>
          <Text style={s.cardText}>{Math.min(exercise.totalSets, session.currentSet + (resting ? 1 : 0))} / {exercise.totalSets} 세트</Text>
        </View>
        <View style={s.cnt}>
          <View style={[s.cntTop, session.paused && s.held]}>
            <Text style={[s.big, lastThree && s.bigLast]}>
              {resting ? restSeconds : exercise.mode === 'reps' ? session.currentRep : time(Math.ceil(session.setRemainingMs / 1000))}
            </Text>
            <Text style={s.bigUnit}>{resting ? (lastThree ? '초 뒤 시작' : '초 쉬는 중') : exercise.mode === 'reps' ? `/ ${exercise.targetRepetitions}회` : '남음'}</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${(resting ? 1 - session.restRemainingMs / Math.max(1, session.restTotalMs) : setProgress) * 100}%` }]} /></View>
          <View style={s.foot}>
            <Text style={s.cardText}>{burned > 0 ? `지금까지 약 ${Math.round(burned).toLocaleString('ko-KR')}kcal` : `세트 사이 쉬기 ${exercise.restSeconds ?? 0}초`}</Text>
            {resting ? (
              <Pressable accessibilityLabel="쉬는 시간 10초 늘리기" accessibilityRole="button" hitSlop={6} onPress={() => onAddRest(10)} style={s.smallButton}><Text style={s.smallButtonText}>+10초</Text></Pressable>
            ) : exercise.mode === 'reps' ? (
              <Pressable accessibilityLabel={`운동 속도 ${SPEEDS[session.countSpeed]}, 바꾸기`} accessibilityRole="button" hitSlop={6} onPress={onCycleSpeed} style={s.smallButton}>
                <Text style={s.smallButtonText}>운동 속도 · {SPEEDS[session.countSpeed]}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={s.acts}>
          <Pressable accessibilityRole="button" hitSlop={6} onPress={openSheet} style={s.smallButton}><Text style={s.smallButtonText}>몸이 불편해요</Text></Pressable>
          {resting ? null : <Pressable accessibilityRole="button" hitSlop={6} onPress={onSkip} style={s.smallButton}><Text style={s.smallButtonText}>이 동작 건너뛰기</Text></Pressable>}
        </View>
        <Pressable accessibilityRole="button" onPress={resting ? onSkipRest : onCompleteSet} style={s.sheetPrimary}>
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
  // Renewal A: one dark outline on every piece, a ledge under what can be pressed, pixel letters.
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const outline = { backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 2 } as const;
  const ledge = `0 4px 0 ${colors.ink}`;
  const soft = '0 4px 0 rgba(32, 35, 63, 0.3)';
  const bar = { backgroundColor: colors.track, borderColor: colors.ink, borderRadius: 99, borderWidth: 2, overflow: 'hidden' } as const;
  const big = { alignItems: 'center', borderColor: colors.ink, borderRadius: 14, borderWidth: 2, boxShadow: ledge, height: 52, justifyContent: 'center' } as const;
  return {
    root: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
    body: { flexGrow: 1, gap: 12, justifyContent: 'center', paddingBottom: 48 },
    grow: { flex: 1, minWidth: 0 },
    // the design's layout: a bar of round buttons, the routine as cells, the demo with the tip joined
    // under it, then the one big number
    bar: { alignItems: 'center', flexDirection: 'row', gap: 8, height: 48 },
    round: { ...outline, alignItems: 'center', borderRadius: 14, boxShadow: soft, height: 44, justifyContent: 'center', width: 44 },
    heading: { color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28, paddingLeft: 2 },
    meta: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: -4, paddingHorizontal: 2 },
    metaNext: { flexShrink: 1, textAlign: 'right' },
    stage: { flexDirection: 'row', gap: 4 },
    stageCell: { backgroundColor: colors.track, borderColor: colors.ink, borderRadius: 4, borderWidth: 2, flex: 1, height: 10, minWidth: 0 },
    stageGap: { marginLeft: 6 },
    stageDone: { backgroundColor: colors.primary },
    stageSkip: { backgroundColor: colors.surface },
    stageNow: { backgroundColor: colors.gold },
    demo: { ...outline, borderRadius: 18, boxShadow: soft, overflow: 'hidden' },
    // Taller than before (4:3), so the body in the demo comes out bigger.
    demoBox: { alignItems: 'center', aspectRatio: 4 / 3, backgroundColor: lightPalette.surface, justifyContent: 'center' },
    clear: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: 'rgba(22, 24, 46, 0.42)', gap: 10, justifyContent: 'center' },
    clearBig: { color: colors.gold, fontFamily: fontFamilies.galmuri11Bold, fontSize: 48, lineHeight: 52, textShadowColor: '#191630', textShadowOffset: { height: 4, width: 4 }, textShadowRadius: 0 },
    clearSub: { ...p15, color: '#FFFFFF' },
    clearInline: { color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    cap: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 60, paddingHorizontal: 12, paddingVertical: 8 },
    capLine: { borderTopColor: colors.ink, borderTopWidth: 2 },
    face: { alignItems: 'center', backgroundColor: colors.primaryLight, borderColor: colors.ink, borderRadius: 11, borderWidth: 2, height: 40, justifyContent: 'center', width: 40 },
    capText: { ...p15, color: colors.ink, flex: 1 },
    now: { alignItems: 'baseline', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 4 },
    move: { color: colors.ink, flexShrink: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    cnt: { ...outline, borderRadius: 18, boxShadow: soft, gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    cntTop: { alignItems: 'baseline', flexDirection: 'row', gap: 8, justifyContent: 'center' },
    held: { opacity: 0.35 },
    // The line is as tall as the gold countdown, so the card does not jump when it comes.
    big: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 72, lineHeight: 84 },
    bigLast: { color: colors.gold, fontSize: 84, textShadowColor: colors.ink, textShadowOffset: { height: 3, width: 3 }, textShadowRadius: 0 },
    bigUnit: { ...p15, color: colors.textSecondary },
    foot: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 34 },
    acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
    headerSide: { width: 64, justifyContent: 'center' },
    headerTitle: { ...p15, flex: 1, color: colors.ink, textAlign: 'center' },
    headerActions: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'flex-end' },
    progressHeading: { flexDirection: 'row', justifyContent: 'space-between' }, progressLabel: { ...p12, color: colors.textSecondary },
    track: { ...bar, height: 16 },
    fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 99 },
    exerciseTitle: { color: colors.ink, fontSize: 24, lineHeight: 28, fontFamily: fontFamilies.galmuri11Bold, marginTop: 4 },
    media: { ...outline, height: 180, borderRadius: 18, boxShadow: soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    mediaImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
    // The demo GIFs have a white background baked in, so the card is white.
    mediaGif: { backgroundColor: lightPalette.surface, borderColor: colors.ink },
    mediaTextOnGif: { color: lightPalette.textSecondary },
    videoAction: { alignItems: 'center', gap: 6 },
    playCircle: { ...outline, alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
    mediaText: { ...p12, color: colors.textSecondary },
    caption: { alignItems: 'center', backgroundColor: 'rgba(32,35,63,0.85)', borderRadius: 12, bottom: 10, flexDirection: 'row', gap: 6, left: 12, paddingHorizontal: 12, paddingVertical: 6, position: 'absolute', right: 12 },
    captionText: { ...p12, color: '#FFFFFF', flex: 1 },
    repArea: { alignItems: 'center', paddingTop: 4 },
    restLabel: { ...p12, color: colors.textSecondary },
    repNumber: { color: colors.ink, fontSize: 64, lineHeight: 72, fontFamily: fontFamilies.galmuri11Bold },
    repTotal: { color: colors.textSecondary, fontSize: 18, fontFamily: fontFamilies.galmuri14 }, setText: { ...p15, color: colors.ink },
    setBars: { flexDirection: 'row', gap: 6 }, setBar: { flex: 1, gap: 4, minWidth: 0 },
    setTrack: { ...bar, height: 12 },
    setLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    setLabel: { ...p12, color: colors.textSecondary, flexShrink: 1 }, setLabelNow: { color: colors.ink },
    tipCard: { ...outline, borderRadius: 18, boxShadow: soft, flexDirection: 'row', gap: 8, padding: 14 },
    cardTitle: { ...p15, color: colors.ink }, cardText: { ...p12, color: colors.textSecondary },
    nextCard: { ...outline, alignItems: 'center', borderRadius: 18, boxShadow: soft, flexDirection: 'row', gap: 10, padding: 14 },
    nextIcon: { alignItems: 'center', backgroundColor: colors.primaryLight, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, height: 36, justifyContent: 'center', width: 36 },
    nextTitle: { ...p15, color: colors.ink },
    smallButton: { ...outline, alignItems: 'center', borderRadius: 10, boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)', height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    smallButtonText: { ...p12, color: colors.ink },
    actions: { flexDirection: 'row', gap: 8 }, footer: { gap: 10, paddingHorizontal: 16, paddingTop: 8 },
    secondaryButton: { ...big, flex: 1, backgroundColor: colors.surface },
    secondaryText: { ...p15, color: colors.ink },
    primaryButton: { ...big, flex: 1, backgroundColor: colors.primary },
    primaryText: { color: colors.onPrimary, fontSize: 22, lineHeight: 26, fontFamily: fontFamilies.galmuri11Bold }, disabled: { backgroundColor: colors.surfaceMuted }, disabledText: { color: colors.textDisabled },
    sheetPrimary: { ...big, backgroundColor: colors.primary },
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: colors.surface, borderColor: colors.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, padding: 20, gap: 12 },
    sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 28, fontFamily: fontFamilies.galmuri11Bold },
    sheetDescription: { ...p15, color: colors.textBody },
    notice: { alignItems: 'flex-start', backgroundColor: colors.warningLight, borderColor: colors.ink, borderRadius: 14, borderWidth: 2, flexDirection: 'row', gap: 8, padding: 14 },
    noticeTitle: { ...p15, color: colors.warning },
    fieldTitle: { ...p15, color: colors.ink },
    optional: { ...p12, color: colors.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { ...outline, alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', paddingHorizontal: 14 },
    selectedChip: { backgroundColor: colors.primary, borderColor: colors.ink }, chipText: { ...p15, color: colors.ink }, selectedChipText: { color: colors.onPrimary },
    feelings: { flexDirection: 'row', gap: 8 }, feeling: { flex: 1, paddingHorizontal: 4 },
    input: { ...outline, borderRadius: 12, color: colors.ink, fontFamily: fontFamilies.galmuri14, fontSize: 15, height: 46, paddingHorizontal: 12 },
    voiceRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 },
    voiceTitle: { ...p15, color: colors.ink }, smallText: { ...p12, color: colors.textSecondary },
    switch: { width: 46, height: 28, backgroundColor: colors.track, borderColor: colors.ink, borderRadius: 14, borderWidth: 2, padding: 1 }, switchOn: { backgroundColor: colors.primary }, switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 2 }, switchThumbOn: { alignSelf: 'flex-end' },
  } as const;
}
