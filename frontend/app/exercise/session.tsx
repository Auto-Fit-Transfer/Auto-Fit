import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import PauseIcon from '@/assets/icons/ui/pause-fill.svg';
import PlayIcon from '@/assets/icons/ui/play-fill.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import {
  AppBottomSheet,
  AppButton,
  AppDialog,
  AppTextField,
  IconButton,
  Notice,
  ProgressBar,
  Text,
} from '@/src/components/common';
import { AdjustmentIndicatorView } from '@/src/components/exercise/AdjustmentIndicatorView';
import { ChoiceChips, ChoiceSection } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import {
  useExerciseSession,
  type ExerciseCountSpeed,
  type ExerciseSessionExercise,
  type ExerciseSessionState,
} from '@/src/features/exercise/ExerciseSessionContext';
import { useTemporaryAdjustmentProgress } from '@/src/features/exercise/useTemporaryAdjustmentProgress';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type DiscomfortFeedbackType = 'pain' | 'fatigue' | 'dizziness' | 'breathing' | 'other';

type DiscomfortFeedbackDraft = {
  bodyParts: string[];
  feedbackLevel: number;
  feedbackType: DiscomfortFeedbackType;
  note: string;
};

const changeOptions: { value: DiscomfortFeedbackType; label: string }[] = [
  { value: 'pain', label: '아파요' },
  { value: 'fatigue', label: '피곤해요' },
  { value: 'dizziness', label: '어지러워요' },
  { value: 'breathing', label: '숨이 차요' },
  { value: 'other', label: '기타' },
];
const bodyPartOptions = ['목', '어깨', '허리', '무릎', '손목', '발목', '기타'].map((part) => ({
  value: part,
  label: part,
}));
// Words in place of the old 0~10 slider; the number goes with the report.
const painFeelingOptions = [
  { value: 3, label: '뻐근해요' },
  { value: 6, label: '찌릿해요' },
  { value: 9, label: '아파요' },
];
const levelOptions = [
  { value: 3, label: '조금' },
  { value: 6, label: '꽤' },
  { value: 9, label: '많이' },
];

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function speedLabel(speed: ExerciseCountSpeed) {
  if (speed === 'fast') return '빠름';
  if (speed === 'slow') return '느림';
  return '보통';
}

function prescription(exercise: ExerciseSessionExercise) {
  const amount =
    exercise.mode === 'timed'
      ? `${exercise.targetSeconds ?? 0}초`
      : `${exercise.targetRepetitions ?? 0}회`;
  const rest = exercise.restSeconds ? ` · 쉬기 ${exercise.restSeconds}초` : '';
  return `${exercise.totalSets}세트 × ${amount}${rest}`;
}

// Figma E4 (운동하기) and E5 (몸이 불편해요). The session logic lives in ExerciseSessionContext.
export default function ExerciseSessionScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { markRoutineCompleted, resultRecordCompleted } = useExerciseRoutine();
  const {
    addRestSeconds,
    clearSession,
    closeExitConfirmation,
    closeSkipConfirmation,
    completeCurrentSet,
    completeSession,
    currentExercise,
    cycleCountSpeed,
    goToNextExercise,
    openExitConfirmation,
    openSkipConfirmation,
    session,
    skipRest,
    skipCurrentExercise,
    summary,
    togglePause,
  } = useExerciseSession();
  const [isCompleting, setIsCompleting] = useState(false);
  const [discomfortVisible, setDiscomfortVisible] = useState(false);
  const [adjustmentOverlayVisible, setAdjustmentOverlayVisible] = useState(false);
  const adjustmentDraftRef = useRef<DiscomfortFeedbackDraft | null>(null);
  // The workout pauses while the discomfort sheet is open and goes on when it closes.
  const pausedForSheetRef = useRef(false);
  const hasSession = session !== null;
  const exitConfirmationVisible = session?.exitConfirmationVisible ?? false;
  const skipConfirmationVisible = session?.skipConfirmationVisible ?? false;

  const resumeAfterSheet = useCallback(() => {
    if (pausedForSheetRef.current) {
      pausedForSheetRef.current = false;
      togglePause();
    }
  }, [togglePause]);

  const openDiscomfort = useCallback(() => {
    if (session && !session.paused) {
      pausedForSheetRef.current = true;
      togglePause();
    }
    setDiscomfortVisible(true);
  }, [session, togglePause]);

  const closeDiscomfort = useCallback(() => {
    setDiscomfortVisible(false);
    resumeAfterSheet();
  }, [resumeAfterSheet]);

  const requestAdjustment = useCallback((draft: DiscomfortFeedbackDraft) => {
    adjustmentDraftRef.current = draft;
    setDiscomfortVisible(false);
    setAdjustmentOverlayVisible(true);
  }, []);

  const endFromDiscomfort = useCallback(() => {
    pausedForSheetRef.current = false;
    setDiscomfortVisible(false);
    openExitConfirmation();
  }, [openExitConfirmation]);

  const handleAdjustmentOverlayFinished = useCallback(() => {
    // TODO: Replace this TEMP simulation completion with the adjustment API response,
    // then update the remaining exercises in ExerciseSessionContext before revealing the session.
    adjustmentDraftRef.current = null;
    setAdjustmentOverlayVisible(false);
    resumeAfterSheet();
  }, [resumeAfterSheet]);

  useEffect(() => {
    if (session || resultRecordCompleted) return undefined;
    const frame = requestAnimationFrame(() => router.replace('/exercise/summary'));
    return () => cancelAnimationFrame(frame);
  }, [resultRecordCompleted, router, session]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !hasSession) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (adjustmentOverlayVisible) return true;
      if (skipConfirmationVisible) closeSkipConfirmation();
      else if (exitConfirmationVisible) closeExitConfirmation();
      else if (discomfortVisible) closeDiscomfort();
      else openExitConfirmation();
      return true;
    });
    return () => subscription.remove();
  }, [
    adjustmentOverlayVisible,
    closeDiscomfort,
    closeExitConfirmation,
    closeSkipConfirmation,
    discomfortVisible,
    exitConfirmationVisible,
    hasSession,
    openExitConfirmation,
    skipConfirmationVisible,
  ]);

  if (!session || !currentExercise) {
    return <SubScreen onBack={() => router.back()} title="운동하기" />;
  }

  const leaveSession = () => {
    clearSession();
    requestAnimationFrame(() => router.dismissTo('/exercise/summary'));
  };

  const finishAndReturnHome = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      const completedSummary = await completeSession();
      markRoutineCompleted({
        calories: completedSummary.calories,
        durationMinutes: completedSummary.durationMinutes,
        itemCount: completedSummary.completedCount,
        sessionId: session.sessionId,
      });
      clearSession();
      requestAnimationFrame(() => router.replace('/exercise'));
    } catch (error) {
      console.error('Exercise session completion failed:', error);
      Alert.alert('운동 결과를 저장하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsCompleting(false);
    }
  };

  const finishAndOpenResultRecord = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      const completedSummary = await completeSession();
      markRoutineCompleted({
        calories: completedSummary.calories,
        durationMinutes: completedSummary.durationMinutes,
        itemCount: completedSummary.completedCount,
        sessionId: session.sessionId,
      });
      // Keep the completed session alive until the user explicitly submits their result record.
      // This lets the result-record Back action return to this completion screen.
      requestAnimationFrame(() =>
        router.push({ pathname: '/exercise/result', params: { source: 'completion' } }),
      );
    } catch (error) {
      console.error('Exercise session completion failed:', error);
      Alert.alert('운동 결과를 저장하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsCompleting(false);
    }
  };

  const nextExercise = session.exercises[session.currentExerciseIndex + 1] ?? null;
  const inProgress = session.phase === 'exercise' || session.phase === 'rest';
  const allDone = session.phase === 'all-completed' || session.phase === 'all-skipped';

  let content = null;
  let footer = null;
  if (session.phase === 'rest') {
    content = (
      <RestView
        onAddRest={() => addRestSeconds(10)}
        onSkipExercise={openSkipConfirmation}
        onTogglePause={togglePause}
        session={session}
      />
    );
    footer = <AppButton onPress={skipRest} title="휴식 건너뛰기" />;
  } else if (session.phase === 'exercise-completed') {
    content = <ExerciseDoneView exercise={currentExercise} session={session} />;
    footer = <AppButton onPress={goToNextExercise} title="다음" />;
  } else if (allDone) {
    const allSkipped = session.phase === 'all-skipped';
    content = <AllDoneView allSkipped={allSkipped} summary={summary} />;
    footer = (
      <AppButton
        loading={isCompleting}
        onPress={() => void (allSkipped ? finishAndReturnHome() : finishAndOpenResultRecord())}
        title={allSkipped ? '운동 홈으로' : '운동 결과 기록하기'}
      />
    );
  } else {
    content = (
      <ExerciseView
        exercise={currentExercise}
        nextExercise={nextExercise}
        onCycleSpeed={cycleCountSpeed}
        onSkip={openSkipConfirmation}
        onTogglePause={togglePause}
        session={session}
      />
    );
    footer = (
      <View style={styles.footerRow}>
        <AppButton
          fullWidth={false}
          onPress={openDiscomfort}
          style={styles.flex}
          title="몸이 불편해요"
          variant="secondary"
        />
        <AppButton
          fullWidth={false}
          onPress={completeCurrentSet}
          style={styles.flex}
          title="세트 완료"
        />
      </View>
    );
  }

  return (
    <>
      <SubScreen
        footer={footer}
        gap={16}
        onBack={openExitConfirmation}
        right={
          inProgress ? (
            <IconButton
              accessibilityLabel={session.paused ? '다시 시작' : '잠시 멈추기'}
              icon={
                session.paused ? (
                  <PlayIcon color={colors.textPrimary} height={24} width={24} />
                ) : (
                  <PauseIcon color={colors.textPrimary} height={24} width={24} />
                )
              }
              onPress={togglePause}
              size={44}
            />
          ) : undefined
        }
        title="운동하기"
      >
        {inProgress ? (
          <View style={styles.progress}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {session.currentExerciseIndex + 1} / {session.exercises.length} 동작
              </Text>
              <Text style={styles.caption}>
                {session.paused ? '멈춤 · ' : ''}
                {formatClock(session.elapsedExerciseMs / 1000)}
              </Text>
            </View>
            <ProgressBar
              height={6}
              value={(session.currentExerciseIndex + 1) / session.exercises.length}
            />
          </View>
        ) : null}
        {content}
      </SubScreen>
      <DiscomfortSheet
        onAdjust={requestAdjustment}
        onClose={closeDiscomfort}
        onEnd={endFromDiscomfort}
        visible={discomfortVisible}
      />
      {adjustmentOverlayVisible ? (
        <AdjustmentIndicatorOverlay onFinished={handleAdjustmentOverlayFinished} />
      ) : null}
      <AppDialog
        cancelText="취소"
        confirmText="건너뛰기"
        description="지금 동작의 진행 내용은 저장되지 않아요."
        onCancel={closeSkipConfirmation}
        onConfirm={skipCurrentExercise}
        title="이 동작을 건너뛸까요?"
        visible={skipConfirmationVisible}
      />
      <AppDialog
        cancelText="계속하기"
        confirmText="그만하기"
        description="지금 나가면 진행 중인 운동이 기록되지 않을 수 있어요."
        destructive
        onCancel={closeExitConfirmation}
        onConfirm={leaveSession}
        title="운동을 그만할까요?"
        visible={exitConfirmationVisible}
      />
    </>
  );
}

function ExerciseView({
  exercise,
  nextExercise,
  onCycleSpeed,
  onSkip,
  onTogglePause,
  session,
}: {
  exercise: ExerciseSessionExercise;
  nextExercise: ExerciseSessionExercise | null;
  onCycleSpeed: () => void;
  onSkip: () => void;
  onTogglePause: () => void;
  session: ExerciseSessionState;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const imageUri = exercise.thumbnailUrl?.trim();
  const showImage = Boolean(imageUri) && imageUri !== failedImageUri;
  const timed = exercise.mode === 'timed';
  const targetSeconds = exercise.targetSeconds ?? 0;
  const remainingSeconds = Math.ceil(session.setRemainingMs / 1000);
  const currentProgress = timed
    ? targetSeconds > 0
      ? 1 - session.setRemainingMs / (targetSeconds * 1000)
      : 0
    : (exercise.targetRepetitions ?? 0) > 0
      ? session.currentRep / (exercise.targetRepetitions ?? 1)
      : 0;

  return (
    <>
      <Text accessibilityRole="header" style={styles.exerciseName}>
        {exercise.name}
      </Text>
      <View style={styles.media}>
        {showImage ? (
          <Image
            accessibilityLabel={`${exercise.name} 동작`}
            onError={() => setFailedImageUri(imageUri ?? null)}
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={styles.mediaImage}
          />
        ) : (
          <BarbellIcon color={colors.textDisabled} height={40} width={40} />
        )}
      </View>

      <View style={styles.counter}>
        {timed ? (
          <Pressable
            accessibilityLabel={session.paused ? '다시 시작' : '잠시 멈추기'}
            accessibilityRole="button"
            onPress={onTogglePause}
          >
            <Text style={styles.bigNumber}>{formatClock(remainingSeconds)}</Text>
          </Pressable>
        ) : (
          <Text style={styles.bigNumber}>
            {session.currentRep}
            <Text style={styles.bigGoal}> / {exercise.targetRepetitions ?? 0}회</Text>
          </Text>
        )}
        <Text style={styles.caption}>
          총 {exercise.totalSets}세트
          {exercise.restSeconds ? ` · 세트 사이 쉬기 ${exercise.restSeconds}초` : ''}
        </Text>
      </View>

      <SetSegments
        current={session.currentSet}
        currentProgress={currentProgress}
        currentLabel={
          timed
            ? `${session.currentSet}세트 진행 중`
            : `${session.currentSet}세트 · ${session.currentRep}/${exercise.targetRepetitions ?? 0}회`
        }
        total={exercise.totalSets}
      />

      {!timed ? (
        <AppButton
          fullWidth={false}
          onPress={onCycleSpeed}
          size="S"
          style={styles.speedButton}
          title={`세는 속도 · ${speedLabel(session.countSpeed)}`}
          variant="outline"
        />
      ) : null}

      <Notice
        body={exercise.instruction ?? '자세를 확인하고 천천히 움직여 주세요.'}
        title="자세 팁"
      />

      {nextExercise ? (
        <View style={styles.nextCard}>
          <View style={styles.nextIcon}>
            <BarbellIcon color={colors.textPrimary} height={20} width={20} />
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={styles.strong}>
              다음 · {nextExercise.name}
            </Text>
            <Text style={styles.caption}>{prescription(nextExercise)}</Text>
          </View>
          <AppButton
            fullWidth={false}
            onPress={onSkip}
            size="S"
            title="바로 넘어가기"
            variant="outline"
          />
        </View>
      ) : (
        <AppButton onPress={onSkip} size="M" title="이 동작 건너뛰기" variant="text" />
      )}
    </>
  );
}

// One bar per set: done sets full, the current one by reps or time, the rest empty.
function SetSegments({
  current,
  currentLabel,
  currentProgress,
  total,
}: {
  current: number;
  currentLabel: string;
  currentProgress: number;
  total: number;
}) {
  const styles = useThemedStyles(createStyles);
  const sets = Array.from({ length: total }, (_, index) => index + 1);
  const labelFor = (set: number) =>
    set < current ? `${set}세트 완료` : set === current ? currentLabel : `${set}세트 남음`;
  return (
    <View style={styles.segments}>
      <View style={styles.segmentRow}>
        {sets.map((set) => {
          const fill = set < current ? 1 : set === current ? currentProgress : 0;
          return (
            <View key={set} style={styles.segment}>
              <View
                style={[styles.segmentFill, { width: `${Math.max(0, Math.min(1, fill)) * 100}%` }]}
              />
            </View>
          );
        })}
      </View>
      {total <= 4 ? (
        <View style={styles.segmentRow}>
          {sets.map((set) => (
            <Text
              key={set}
              numberOfLines={1}
              style={[styles.segmentLabel, set === current && styles.segmentLabelCurrent]}
            >
              {labelFor(set)}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.segmentLabelCurrent}>{labelFor(current)}</Text>
      )}
    </View>
  );
}

function RestView({
  onAddRest,
  onSkipExercise,
  onTogglePause,
  session,
}: {
  onAddRest: () => void;
  onSkipExercise: () => void;
  onTogglePause: () => void;
  session: ExerciseSessionState;
}) {
  const styles = useThemedStyles(createStyles);
  const remaining = session.restRemainingMs / 1000;
  const ratio = session.restTotalMs > 0 ? session.restRemainingMs / session.restTotalMs : 0;
  return (
    <>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          쉬어 가세요
        </Text>
        <Text style={styles.description}>다음 세트를 위해 숨을 골라 주세요.</Text>
      </View>
      <Pressable
        accessibilityLabel={session.paused ? '다시 시작' : '잠시 멈추기'}
        accessibilityRole="button"
        onPress={onTogglePause}
        style={styles.restTimer}
      >
        <Text style={styles.bigNumber}>{formatClock(Math.ceil(remaining))}</Text>
        <Text style={styles.caption}>
          {session.paused ? '멈춤 · 누르면 다시 시작' : '누르면 멈춰요'}
        </Text>
      </Pressable>
      <ProgressBar height={6} value={ratio} />
      <View style={styles.restActions}>
        <AppButton
          fullWidth={false}
          onPress={onAddRest}
          size="M"
          title="+ 10초"
          variant="outline"
        />
        <AppButton
          fullWidth={false}
          onPress={onSkipExercise}
          size="M"
          title="이 동작 건너뛰기"
          variant="text"
        />
      </View>
    </>
  );
}

function ExerciseDoneView({
  exercise,
  session,
}: {
  exercise: ExerciseSessionExercise;
  session: ExerciseSessionState;
}) {
  const styles = useThemedStyles(createStyles);
  const result = session.results[session.results.length - 1];
  const stats = [
    { label: '운동 시간', value: formatClock(result?.elapsedSeconds ?? 0) },
    { label: '마친 세트', value: `${result?.completedSets ?? exercise.totalSets}세트` },
    {
      label: '소모 칼로리',
      value: result?.caloriesBurned == null ? '-' : `${result.caloriesBurned}kcal`,
    },
  ];
  return (
    <>
      <DoneHeading
        description={`${session.currentExerciseIndex + 1}번째 동작을 마쳤어요.`}
        title={`${exercise.name} 완료`}
      />
      <View style={styles.stats}>
        {stats.map((stat, index) => (
          <View key={stat.label} style={[styles.stat, index > 0 && styles.statDivider]}>
            <Text style={styles.caption}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function AllDoneView({
  allSkipped,
  summary,
}: {
  allSkipped: boolean;
  summary: { completedCount: number; skippedCount: number };
}) {
  return (
    <DoneHeading
      description={
        allSkipped
          ? `건너뛴 동작 ${summary.skippedCount}개 · 오늘은 마친 동작이 없어요.`
          : summary.skippedCount > 0
            ? `마친 동작 ${summary.completedCount}개 · 건너뛴 동작 ${summary.skippedCount}개`
            : '모든 동작을 마쳤어요. 어땠는지 기록해 주세요.'
      }
      done={!allSkipped}
      title={allSkipped ? '오늘 운동을 끝냈어요' : '오늘 운동을 마쳤어요'}
    />
  );
}

function DoneHeading({
  description,
  done = true,
  title,
}: {
  description: string;
  done?: boolean;
  title: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.heading}>
      <View style={[styles.checkCircle, !done && styles.checkCircleMuted]}>
        <CheckIcon color={done ? colors.success : colors.textSecondary} height={30} width={30} />
      </View>
      <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

// Figma E5. TEMP: the report is not sent yet and "남은 운동 바꾸기" only shows the adjusting
// screen; the remaining exercises stay as they are until the adjustment service is connected.
function DiscomfortSheet({
  onAdjust,
  onClose,
  onEnd,
  visible,
}: {
  onAdjust: (draft: DiscomfortFeedbackDraft) => void;
  onClose: () => void;
  onEnd: () => void;
  visible: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const [feedbackType, setFeedbackType] = useState<DiscomfortFeedbackType>('pain');
  const [bodyParts, setBodyParts] = useState<string[]>([]);
  const [level, setLevel] = useState(6);
  const [note, setNote] = useState('');
  const urgent = feedbackType === 'dizziness' || feedbackType === 'breathing';

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      setFeedbackType('pain');
      setBodyParts([]);
      setLevel(6);
      setNote('');
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const togglePart = (part: string) =>
    setBodyParts((current) =>
      current.includes(part) ? current.filter((item) => item !== part) : [...current, part],
    );

  return (
    <AppBottomSheet
      contentStyle={styles.sheetContent}
      footer={
        <View style={styles.footerRow}>
          <AppButton
            fullWidth={false}
            onPress={onEnd}
            style={styles.flex}
            title="오늘은 그만하기"
            variant="secondary"
          />
          <AppButton
            fullWidth={false}
            onPress={() => onAdjust({ bodyParts, feedbackLevel: level, feedbackType, note })}
            style={styles.flex}
            title="남은 운동 바꾸기"
          />
        </View>
      }
      keyboardShouldPersistTaps="handled"
      onClose={onClose}
      scrollable="when-overflow"
      title="어디가 불편했나요?"
      visible={visible}
    >
      <Text style={styles.description}>
        운동은 잠시 멈춰 있어요. 알려 주시면 남은 운동을 바꿔 드려요.
      </Text>
      <Notice
        body={
          urgent
            ? '바로 멈추고 앉아서 쉬어 주세요. 나아지지 않으면 주변에 도움을 요청하세요.'
            : '바로 멈추고 전문가와 상담해 주세요.'
        }
        title={urgent ? '어지럽거나 숨이 많이 차면' : '통증이 심하면'}
        tone="warning"
      />
      <ChoiceSection title="무엇이 달라졌나요?">
        <ChoiceChips
          isSelected={(value) => feedbackType === value}
          onSelect={(value) => {
            setFeedbackType(value);
            setLevel(6);
          }}
          options={changeOptions}
        />
      </ChoiceSection>
      {feedbackType === 'pain' ? (
        <>
          <ChoiceSection aside="여러 개 고를 수 있어요" title="불편한 곳">
            <ChoiceChips
              isSelected={(value) => bodyParts.includes(value)}
              onSelect={togglePart}
              options={bodyPartOptions}
            />
          </ChoiceSection>
          <ChoiceSection title="어떤 느낌인가요?">
            <ChoiceChips
              isSelected={(value) => level === value}
              onSelect={setLevel}
              options={painFeelingOptions}
            />
          </ChoiceSection>
        </>
      ) : feedbackType !== 'other' ? (
        <ChoiceSection title="얼마나 심한가요?">
          <ChoiceChips
            isSelected={(value) => level === value}
            onSelect={setLevel}
            options={levelOptions}
          />
        </ChoiceSection>
      ) : null}
      <AppTextField
        maxLength={100}
        onChangeText={setNote}
        placeholder={
          feedbackType === 'pain'
            ? '예) 당길 때 오른쪽 어깨가 찌릿해요 (선택)'
            : '더 알려 주실 내용 (선택)'
        }
        value={note}
      />
    </AppBottomSheet>
  );
}

function AdjustmentIndicatorOverlay({ onFinished }: { onFinished: () => void }) {
  const progress = useTemporaryAdjustmentProgress();
  const [opacity] = useState(() => new Animated.Value(0));
  const finishedRef = useRef(false);

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  useEffect(() => {
    if (progress < 1 || finishedRef.current) return undefined;

    finishedRef.current = true;
    let fadeOut: Animated.CompositeAnimation | undefined;
    const completionHold = setTimeout(() => {
      fadeOut = Animated.timing(opacity, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
      });

      fadeOut.start(({ finished }) => {
        if (finished) onFinished();
      });
    }, 400);

    return () => {
      clearTimeout(completionHold);
      fadeOut?.stop();
    };
  }, [onFinished, opacity, progress]);

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={() => undefined}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
        <AdjustmentIndicatorView progress={progress} />
      </Animated.View>
    </Modal>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  return {
    flex: { flex: 1 },
    footerRow: { flexDirection: 'row', gap: 8 },
    caption: { ...text.caption, color: colors.textSecondary },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    progress: { gap: 8 },
    progressRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    progressText: { ...text.body2Strong, color: colors.textPrimary },
    exerciseName: { ...text.title1, color: colors.textPrimary },
    media: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      height: easyMode ? 200 : 180,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    mediaImage: { height: '100%', width: '100%' },
    counter: { alignItems: 'center', gap: 4 },
    bigNumber: {
      ...text.display,
      color: colors.textPrimary,
      fontSize: easyMode ? 56 : 48,
      lineHeight: easyMode ? 64 : 56,
    },
    bigGoal: { ...text.title2, color: colors.textSecondary },
    segments: { gap: 8 },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: {
      backgroundColor: colors.gaugeTrack,
      borderRadius: 3,
      flex: 1,
      height: 6,
      overflow: 'hidden',
    },
    segmentFill: { backgroundColor: colors.primary, height: '100%' },
    segmentLabel: { ...text.caption, color: colors.textSecondary, flex: 1 },
    segmentLabelCurrent: { ...text.captionStrong, color: colors.textPrimary, flex: 1 },
    speedButton: { alignSelf: 'center' },
    nextCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 14,
    },
    nextIcon: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    heading: { gap: 8, paddingTop: 8 },
    title: { ...text.title1, color: colors.textPrimary },
    description: { ...text.body2, color: colors.textSecondary },
    restTimer: { alignItems: 'center', gap: 4, paddingVertical: 24 },
    restActions: { alignItems: 'center', gap: 4 },
    checkCircle: {
      alignItems: 'center',
      backgroundColor: colors.successLight,
      borderRadius: 28,
      height: 56,
      justifyContent: 'center',
      marginBottom: 12,
      width: 56,
    },
    checkCircleMuted: { backgroundColor: colors.surfaceMuted },
    stats: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      flexDirection: 'row',
      paddingVertical: 16,
    },
    stat: { alignItems: 'center', flex: 1, gap: 4 },
    statDivider: { borderLeftColor: colors.border, borderLeftWidth: 1 },
    statValue: { ...text.title2, color: colors.textPrimary },
    sheetContent: { gap: 20, paddingBottom: 8 },
  } as const;
}
