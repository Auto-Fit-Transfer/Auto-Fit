import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import RightIcon from '@/assets/icons/common/chevrons/Right.svg';
import XIcon from '@/assets/icons/common/X.svg';
import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import FireIcon from '@/assets/icons/deco/Fire.svg';
import ClockIcon from '@/assets/icons/input/Clock.svg';
import LightbulbIcon from '@/assets/icons/system/Lightbulb.svg';
import CheckIcon from '@/assets/icons/system/Check_Bold.svg';
import SpeakerHighIcon from '@/assets/icons/system/SpeakerSimpleHigh.svg';
import SpeakerSlashIcon from '@/assets/icons/system/SpeakerSimpleSlash.svg';
import WarningIcon from '@/assets/icons/system/WarningCircle.svg';
import PauseIcon from '@/assets/icons/feature/Pause_Fill.svg';
import PencilIcon from '@/assets/icons/feature/Pencil_Line.svg';
import PlayIcon from '@/assets/icons/feature/Play_Fill.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { BackButton } from '@/src/components/common/BackButton';
import { AdjustmentIndicatorView } from '@/src/components/exercise/AdjustmentIndicatorView';
import { ExerciseActionButton } from '@/src/components/exercise/ExerciseActionButton';
import { ExerciseScreenFrame } from '@/src/components/exercise/ExerciseScreenFrame';
import { R6ExerciseSession } from '@/src/components/exercise/R6ExerciseSession';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import {
  useExerciseSession,
  type ExerciseCountSpeed,
  type ExerciseSessionExercise,
  type ExerciseSessionState,
} from '@/src/features/exercise/ExerciseSessionContext';
import {
  getMockExerciseBodyParts,
  type ExerciseBodyPart,
} from '@/src/features/exercise/exerciseData';
import { useTemporaryAdjustmentProgress } from '@/src/features/exercise/useTemporaryAdjustmentProgress';
import { loadVoiceGuideSettings, speakGuide } from '@/src/features/exercise/voiceGuide';
import { colors, fontFamilies } from '@/src/theme';

const fallbackExerciseImage = require('@/assets/images/illustrations/temp/Image_Exercise.png');
const finishOneImage = require('@/assets/images/illustrations/exercise/finishes/Finish_One.png');
const finishAllImage = require('@/assets/images/illustrations/exercise/finishes/Finish_All.png');
const skipAllImage = require('@/assets/images/illustrations/exercise/finishes/Skip_All.png');
const completeBadgeImage = require('@/assets/images/illustrations/exercise/Complete_Badge.png');
const skipBadgeImage = require('@/assets/images/illustrations/exercise/Skip_Badge.png');
const modifyImage = require('@/assets/images/illustrations/exercise/circles/Modify.png');

const referenceHeight = 917;
const minimumScreenHeight = 740;
// The Skip_All asset has more transparent edge space than the other completion illustrations.
// Keep this state-specific scale so its visible artwork matches the Figma visual bounds.
const skippedCompletionIllustrationScale = 1.45;

type DiscomfortFeedbackType = 'pain' | 'fatigue' | 'dizziness' | 'breathing' | 'other';
type DiscomfortCloseAction = 'dismiss' | 'end';
type FocusedDiscomfortInput = 'other' | 'pain' | null;
type FollowUpChoice = 'adjust' | 'end';

type DiscomfortFeedbackDraft = {
  feedbackLevel: number;
  feedbackType: DiscomfortFeedbackType;
  otherDescription: string;
  painArea: string;
};

type DiscomfortFeedbackOption = {
  endLabel: string;
  info: string;
  label: string;
  levelLabel: string;
  startLabel: string;
  value: DiscomfortFeedbackType;
};

const discomfortFeedbackOptions: DiscomfortFeedbackOption[] = [
  {
    endLabel: '매우 심함',
    info: '통증 정도와 불편 부위를 반영해 남은 운동 강도와 횟수를 조정해드려요.',
    label: '통증 증가',
    levelLabel: '현재 통증 정도',
    startLabel: '통증 없음',
    value: 'pain',
  },
  {
    endLabel: '매우 피곤함',
    info: '현재 피로도를 반영해 남은 운동 강도와 횟수를 조정해드려요.',
    label: '피로 증가',
    levelLabel: '현재 피로 정도',
    startLabel: '피로 없음',
    value: 'fatigue',
  },
  {
    endLabel: '매우 어지러움',
    info: '현재 상태를 반영해 남은 운동 강도를 조정해드려요.',
    label: '어지럼',
    levelLabel: '현재 어지러움 정도',
    startLabel: '어지럽지 않음',
    value: 'dizziness',
  },
  {
    endLabel: '매우 불편함',
    info: '현재 호흡 상태를 반영해 남은 운동 강도를 조정해드려요.',
    label: '호흡 불편',
    levelLabel: '현재 호흡이 불편한 정도',
    startLabel: '불편하지 않음',
    value: 'breathing',
  },
  {
    endLabel: '매우 불편함',
    info: '입력한 불편 사항을 반영해 남은 운동을 조정해드려요.',
    label: '기타',
    levelLabel: '현재 불편한 정도',
    startLabel: '불편하지 않음',
    value: 'other',
  },
];

function formatClock(totalSeconds: number, spaced = false) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return spaced ? `${minutes} : ${seconds}` : `${minutes}:${seconds}`;
}

function speedCopy(speed: ExerciseCountSpeed) {
  if (speed === 'fast') return { badge: '1.5x', label: '빠름' };
  if (speed === 'slow') return { badge: '0.75x', label: '느림' };
  return { badge: '1.0x', label: '일반' };
}

export default function ExerciseSessionScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
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
    toggleGuide,
    togglePause,
  } = useExerciseSession();
  const [isCompleting, setIsCompleting] = useState(false);
  const [discomfortRecordVisible, setDiscomfortRecordVisible] = useState(false);
  const [discomfortRecordClosing, setDiscomfortRecordClosing] = useState(false);
  const [adjustmentOverlayVisible, setAdjustmentOverlayVisible] = useState(false);
  const [discomfortCloseAction, setDiscomfortCloseAction] =
    useState<DiscomfortCloseAction>('dismiss');
  const adjustmentDraftRef = useRef<DiscomfortFeedbackDraft | null>(null);
  const responsiveHeight =
    Platform.OS === 'android' ? Dimensions.get('screen').height : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(1, (responsiveHeight - minimumScreenHeight) / (referenceHeight - minimumScreenHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const layout = {
    buttonsTop: verticalValue(800, 730),
    completionButtonTop: verticalValue(800, 740),
    completionCardHeight: 110,
    completionCardTop: verticalValue(676, 620),
    completionImageSize: verticalValue(320, 285),
    completionImageTop: verticalValue(268, 225),
    completionTitleTop: verticalValue(165, 140),
    contentHeight: verticalValue(900, 815),
    countToTipMinGap: verticalValue(15, 18),
    counterTop: verticalValue(450, 396),
    mediaHeight: verticalValue(310, 270),
    mediaImageHeight: verticalValue(210, 175),
    mediaTop: verticalValue(125, 110),
    restCircleTop: verticalValue(313, 260),
    restTitleTop: verticalValue(160, 135),
    repProgressGap: verticalValue(25, 18),
    tipHeight: verticalValue(150, 120),
    tipTop: verticalValue(635, 570),
    timedCounterTop: verticalValue(480, 410),
  };
  const hasSession = session !== null;
  const exitConfirmationVisible = session?.exitConfirmationVisible ?? false;
  const skipConfirmationVisible = session?.skipConfirmationVisible ?? false;
  useEffect(() => {
    if (session?.phase !== 'rest' || session.paused) return;
    let active = true;
    void loadVoiceGuideSettings().then((settings) => {
      if (active && settings.announceRest) {
        speakGuide(`쉬는 시간이에요. ${Math.ceil(session.restTotalMs / 1000)}초 쉬어 주세요.`, settings);
      }
    });
    return () => { active = false; };
  }, [session?.phase, session?.paused, session?.restTotalMs, session?.currentExerciseIndex, session?.currentSet]);

  const openDiscomfortRecord = useCallback(() => {
    setDiscomfortCloseAction('dismiss');
    setDiscomfortRecordClosing(false);
    setDiscomfortRecordVisible(true);
  }, []);

  const closeDiscomfortRecord = useCallback(
    (action: DiscomfortCloseAction = 'dismiss') => {
      if (!discomfortRecordVisible || discomfortRecordClosing) return;
      setDiscomfortCloseAction(action);
      setDiscomfortRecordClosing(true);
    },
    [discomfortRecordClosing, discomfortRecordVisible],
  );

  const requestAdjustment = useCallback(
    (draft: DiscomfortFeedbackDraft) => {
      adjustmentDraftRef.current = draft;
      setAdjustmentOverlayVisible(true);
    },
    [],
  );

  const handleDiscomfortRecordClosed = useCallback(() => {
    const shouldEndWorkout = discomfortCloseAction === 'end';
    setDiscomfortRecordVisible(false);
    setDiscomfortRecordClosing(false);
    setDiscomfortCloseAction('dismiss');
    if (shouldEndWorkout) openExitConfirmation();
  }, [discomfortCloseAction, openExitConfirmation]);

  const handleAdjustmentOverlayCovered = useCallback(() => {
    setDiscomfortRecordVisible(false);
    setDiscomfortRecordClosing(false);
    setDiscomfortCloseAction('dismiss');
  }, []);

  const handleAdjustmentOverlayFinished = useCallback(() => {
    // TODO: Replace this TEMP simulation completion with the adjustment API response,
    // then update the remaining exercises in ExerciseSessionContext before revealing the session.
    adjustmentDraftRef.current = null;
    setAdjustmentOverlayVisible(false);
  }, []);

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
      else if (discomfortRecordVisible) closeDiscomfortRecord();
      else openExitConfirmation();
      return true;
    });
    return () => subscription.remove();
  }, [
    closeDiscomfortRecord,
    closeExitConfirmation,
    closeSkipConfirmation,
    discomfortRecordVisible,
    adjustmentOverlayVisible,
    exitConfirmationVisible,
    hasSession,
    openExitConfirmation,
    skipConfirmationVisible,
  ]);

  if (!session || !currentExercise) {
    return <ExerciseScreenFrame contentHeight={layout.contentHeight}>{null}</ExerciseScreenFrame>;
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
      Alert.alert('운동 결과 저장 실패', getExerciseApiErrorMessage(error));
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
      // Keep the completed session until the R6 result screen saves feedback.
      requestAnimationFrame(() =>
        router.push('/exercise/completion'),
      );
    } catch (error) {
      console.error('Exercise session completion failed:', error);
      Alert.alert('운동 결과 저장 실패', getExerciseApiErrorMessage(error));
    } finally {
      setIsCompleting(false);
    }
  };

  if (session.phase === 'exercise') {
    return (
      <>
        <R6ExerciseSession
          exercise={currentExercise}
          onBack={openExitConfirmation}
          onCompleteSet={completeCurrentSet}
          onContinue={() => undefined}
          onSkip={openSkipConfirmation}
          onTogglePause={togglePause}
          session={session}
        />
        {session.skipConfirmationVisible ? (
          <ConfirmationModal
            cancelLabel="취소"
            contentHeight={layout.contentHeight}
            confirmLabel="건너뛰기"
            description={'현재 운동의 진행 내용은 저장되지 않아요.\n다음 운동으로 이동할까요?'}
            onCancel={closeSkipConfirmation}
            onConfirm={skipCurrentExercise}
            title="이 운동을 건너뛸까요?"
          />
        ) : null}
        {session.exitConfirmationVisible ? (
          <ConfirmationModal
            contentHeight={layout.contentHeight}
            confirmLabel="운동 중단"
            description={'지금 나가면 현재 진행중인 운동이\n기록되지 않을 수 있어요.'}
            onCancel={closeExitConfirmation}
            onConfirm={leaveSession}
            title="운동을 중단하시겠어요?"
          />
        ) : null}
      </>
    );
  }

  let content: ReactNode;
  if (session.phase === 'rest') {
    content = (
      <RestContent
        addRestSeconds={addRestSeconds}
        layout={layout}
        onSkip={openSkipConfirmation}
        session={session}
        skipRest={skipRest}
        togglePause={togglePause}
      />
    );
  } else if (session.phase === 'exercise-completed') {
    content = (
      <ExerciseCompletedContent
        exercise={currentExercise}
        layout={layout}
        onNext={goToNextExercise}
        session={session}
      />
    );
  } else if (session.phase === 'all-completed' || session.phase === 'all-skipped') {
    content = (
      <AllCompletedContent
        allSkipped={session.phase === 'all-skipped'}
        disabled={isCompleting}
        layout={layout}
        onFinish={() =>
          void (session.phase === 'all-skipped'
            ? finishAndReturnHome()
            : finishAndOpenResultRecord())
        }
        session={session}
        summary={summary}
      />
    );
  } else {
    content = (
      <ExerciseContent
        completeCurrentSet={completeCurrentSet}
        cycleCountSpeed={cycleCountSpeed}
        exercise={currentExercise}
        layout={layout}
        onRecordDiscomfort={openDiscomfortRecord}
        onSkip={openSkipConfirmation}
        session={session}
        toggleGuide={toggleGuide}
        togglePause={togglePause}
      />
    );
  }

  return (
    <ExerciseScreenFrame contentHeight={layout.contentHeight}>
      <SessionHeader
        exercise={currentExercise}
        onBack={openExitConfirmation}
        session={session}
        togglePause={togglePause}
      />
      {content}
      {discomfortRecordVisible ? (
        <DiscomfortRecordModal
          isClosing={discomfortRecordClosing}
          onClose={closeDiscomfortRecord}
          onClosed={handleDiscomfortRecordClosed}
          onRequestAdjust={requestAdjustment}
          onRequestEnd={() => closeDiscomfortRecord('end')}
        />
      ) : null}
      {adjustmentOverlayVisible ? (
        <AdjustmentIndicatorOverlay
          onCovered={handleAdjustmentOverlayCovered}
          onFinished={handleAdjustmentOverlayFinished}
        />
      ) : null}
      {session.skipConfirmationVisible ? (
        <ConfirmationModal
          cancelLabel="취소"
          contentHeight={layout.contentHeight}
          confirmLabel="건너뛰기"
          description={'현재 운동의 진행 내용은 저장되지 않아요.\n다음 운동으로 이동할까요?'}
          onCancel={closeSkipConfirmation}
          onConfirm={skipCurrentExercise}
          title="이 운동을 건너뛸까요?"
        />
      ) : null}
      {session.exitConfirmationVisible ? (
        <ConfirmationModal
          contentHeight={layout.contentHeight}
          confirmLabel="운동 중단"
          description={'지금 나가면 현재 진행중인 운동이\n기록되지 않을 수 있어요.'}
          onCancel={closeExitConfirmation}
          onConfirm={leaveSession}
          title="운동을 중단하시겠어요?"
        />
      ) : null}
    </ExerciseScreenFrame>
  );
}

type SessionLayout = {
  buttonsTop: number;
  countToTipMinGap: number;
  completionCardTop: number;
  completionCardHeight: number;
  completionButtonTop: number;
  completionImageSize: number;
  completionImageTop: number;
  completionTitleTop: number;
  contentHeight: number;
  counterTop: number;
  mediaHeight: number;
  mediaImageHeight: number;
  mediaTop: number;
  restCircleTop: number;
  restTitleTop: number;
  repProgressGap: number;
  tipHeight: number;
  tipTop: number;
  timedCounterTop: number;
};

function SessionHeader({
  exercise,
  onBack,
  session,
  togglePause,
}: {
  exercise: ExerciseSessionExercise;
  onBack: () => void;
  session: ExerciseSessionState;
  togglePause: () => void;
}) {
  const showTimer = session.phase === 'exercise';
  const progress = (session.currentExerciseIndex + 1) / session.exercises.length;
  return (
    <>
      <BackButton onPress={onBack} style={styles.back} />
      <Text style={styles.screenTitle}>운동 수행</Text>
      {showTimer ? (
        <Pressable onPress={togglePause} style={styles.topTimer}>
          <View style={styles.timerDot} />
          <Text style={styles.topTimerText}>
            {formatClock(Math.floor(session.elapsedExerciseMs / 1000))}
          </Text>
          {session.paused ? (
            <PlayIcon color={colors.primary} height={25} width={25} />
          ) : (
            <PauseIcon color={colors.primary} height={25} width={25} />
          )}
        </Pressable>
      ) : null}
      <View style={styles.progressRow}>
        <Text style={styles.progressCurrent}>{session.currentExerciseIndex + 1}</Text>
        <Text style={styles.progressTotal}> / {session.exercises.length}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
      <Text accessibilityElementsHidden style={styles.hiddenExerciseName}>
        {exercise.name}
      </Text>
    </>
  );
}

function ExerciseContent({
  completeCurrentSet,
  cycleCountSpeed,
  exercise,
  layout,
  onRecordDiscomfort,
  onSkip,
  session,
  toggleGuide,
  togglePause,
}: {
  completeCurrentSet: () => void;
  cycleCountSpeed: () => void;
  exercise: ExerciseSessionExercise;
  layout: SessionLayout;
  onRecordDiscomfort: () => void;
  onSkip: () => void;
  session: ExerciseSessionState;
  toggleGuide: () => void;
  togglePause: () => void;
}) {
  const [repProgressHeight, setRepProgressHeight] = useState<number | null>(null);
  const expectedRepProgressHeight = 120 + layout.repProgressGap * 2;
  const measuredRepProgressHeight = repProgressHeight ?? expectedRepProgressHeight;
  // Preserve the shared lower layout while keeping the speed button clear of the fixed TIP card.
  const constrainedRepProgressTop = Math.min(
    layout.counterTop,
    layout.tipTop - layout.countToTipMinGap - measuredRepProgressHeight,
  );
  const handleRepProgressLayout = useCallback((height: number) => {
    setRepProgressHeight((previousHeight) =>
      previousHeight === height ? previousHeight : height,
    );
  }, []);

  return (
    <>
      <ExerciseMediaCard
        exercise={exercise}
        guideEnabled={session.guideEnabled}
        height={layout.mediaHeight}
        imageHeight={layout.mediaImageHeight}
        onToggleGuide={toggleGuide}
        top={layout.mediaTop}
      />
      {exercise.mode === 'timed' ? (
        <TimedProgress
          exercise={exercise}
          onPress={togglePause}
          paused={session.paused}
          remainingSeconds={Math.ceil(session.setRemainingMs / 1000)}
          set={session.currentSet}
          top={layout.timedCounterTop}
        />
      ) : (
        <RepProgress
          currentRep={session.currentRep}
          exercise={exercise}
          onCycleSpeed={cycleCountSpeed}
          onLayout={handleRepProgressLayout}
          gap={layout.repProgressGap}
          set={session.currentSet}
          speed={session.countSpeed}
          top={constrainedRepProgressTop}
        />
      )}
      <TipCard height={layout.tipHeight} instruction={exercise.instruction} top={layout.tipTop} />
      <ExerciseControls
        onCompleteSet={completeCurrentSet}
        onRecordDiscomfort={onRecordDiscomfort}
        onSkip={onSkip}
        set={session.currentSet}
        totalSets={exercise.totalSets}
        top={layout.buttonsTop}
      />
    </>
  );
}

function ExerciseMediaCard({
  exercise,
  guideEnabled,
  height,
  imageHeight,
  onToggleGuide,
  top,
}: {
  exercise: ExerciseSessionExercise;
  guideEnabled: boolean;
  height: number;
  imageHeight: number;
  onToggleGuide: () => void;
  top: number;
}) {
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const remoteSource = exercise.thumbnailUrl?.trim();
  const imageSource: ImageSourcePropType =
    remoteSource && remoteSource !== failedImageUri ? { uri: remoteSource } : fallbackExerciseImage;
  const bodyParts = getMockExerciseBodyParts(exercise.name);

  return (
    <View style={[styles.mediaCard, { height, top }]}>
      <View style={styles.mediaHeader}>
        <View style={styles.exerciseIdentity}>
          <View style={styles.exerciseNumber}>
            <Text style={styles.exerciseNumberText}>{exercise.sequenceOrder ?? ''}</Text>
          </View>
          <View style={styles.exerciseHeading}>
            <Text numberOfLines={1} style={styles.exerciseName}>
              {exercise.name}
            </Text>
            <View style={styles.tagRow}>
              {bodyParts.map((bodyPart) => (
                <ExerciseBodyPartBadge bodyPart={bodyPart} key={bodyPart} />
              ))}
            </View>
          </View>
        </View>
        <Pressable onPress={onToggleGuide} style={styles.guideButton}>
          <Text style={styles.guideText}>{guideEnabled ? 'Guide ON' : 'Guide OFF'}</Text>
          <View style={styles.guideIcon}>
            {guideEnabled ? (
              <SpeakerHighIcon color="#FFFFFF" height={18} width={18} />
            ) : (
              <SpeakerSlashIcon color="#FFFFFF" height={18} width={18} />
            )}
          </View>
        </Pressable>
      </View>
      <View style={[styles.mediaImageArea, { height: imageHeight }]}>
        <Image
          onError={() => setFailedImageUri(remoteSource ?? null)}
          resizeMode="cover"
          source={imageSource}
          style={styles.mediaImage}
        />
        <View pointerEvents="none" style={styles.playCircle}>
          <PlayIcon color={colors.primary} height={30} width={30} />
        </View>
      </View>
    </View>
  );
}

function ExerciseBodyPartBadge({ bodyPart }: { bodyPart: ExerciseBodyPart }) {
  const useGoldBadge = bodyPart === '둔근' || bodyPart === '종아리';
  return (
    <View style={useGoldBadge ? styles.goldTag : styles.blueTag}>
      <Text style={useGoldBadge ? styles.goldTagText : styles.blueTagText}>{bodyPart}</Text>
    </View>
  );
}

function RepProgress({
  currentRep,
  exercise,
  gap,
  onCycleSpeed,
  onLayout,
  set,
  speed,
  top,
}: {
  currentRep: number;
  exercise: ExerciseSessionExercise;
  gap: number;
  onCycleSpeed: () => void;
  onLayout: (height: number) => void;
  set: number;
  speed: ExerciseCountSpeed;
  top: number;
}) {
  const speedState = speedCopy(speed);
  return (
    <View
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={[styles.repProgress, { gap, top }]}
    >
      <Text style={styles.repCount}>
        {currentRep}
        <Text style={styles.repGoal}> / {exercise.targetRepetitions}회</Text>
      </Text>
      <View style={styles.setDescription}>
        <Text style={styles.setActive}>{set}세트 진행중</Text>
        <View style={styles.shortDivider} />
        <Text style={styles.setTotal}>
          총 {exercise.totalSets}세트, {exercise.targetRepetitions}회
        </Text>
      </View>
      <Pressable onPress={onCycleSpeed} style={styles.speedButton}>
        <Text style={styles.speedButtonText}>속도 {speedState.label}</Text>
        <PencilIcon color={colors.primaryDark} height={20} width={20} />
      </Pressable>
    </View>
  );
}

function TimedProgress({
  exercise,
  onPress,
  paused,
  remainingSeconds,
  set,
  top,
}: {
  exercise: ExerciseSessionExercise;
  onPress: () => void;
  paused: boolean;
  remainingSeconds: number;
  set: number;
  top: number;
}) {
  return (
    <View style={[styles.timedProgress, { top }]}>
      <Pressable onPress={onPress} style={styles.timedButton}>
        <Text style={styles.timedText}>{formatClock(remainingSeconds)}</Text>
        {paused ? (
          <PlayIcon color="#FFFFFF" height={32} width={32} />
        ) : (
          <PauseIcon color="#FFFFFF" height={32} width={32} />
        )}
      </Pressable>
      <View style={styles.setDescription}>
        <Text style={styles.setActive}>{set}세트 진행중</Text>
        <View style={styles.shortDivider} />
        <Text style={styles.setTotal}>
          총 {exercise.totalSets}세트, {exercise.targetSeconds}초
        </Text>
      </View>
    </View>
  );
}

function TipCard({
  height,
  instruction,
  top,
}: {
  height: number;
  instruction: string | null;
  top: number;
}) {
  return (
    <View style={[styles.tipCard, { height, top }]}>
      <View style={styles.tipIconCircle}>
        <LightbulbIcon color={colors.primaryDark} height={27} width={27} />
      </View>
      <View style={styles.tipCopy}>
        <Text style={styles.tipTitle}>TIP</Text>
        <Text style={styles.tipText}>{instruction ?? '자세를 확인하고 천천히 움직여 주세요.'}</Text>
      </View>
    </View>
  );
}

function ExerciseControls({
  onCompleteSet,
  onRecordDiscomfort,
  onSkip,
  set,
  totalSets,
  top,
}: {
  onCompleteSet: () => void;
  onRecordDiscomfort: () => void;
  onSkip: () => void;
  set: number;
  totalSets: number;
  top: number;
}) {
  const isLastSet = set === totalSets;

  return (
    <View style={[styles.controls, { top }]}>
      <View style={styles.controlRow}>
        <Pressable onPress={onRecordDiscomfort} style={styles.secondaryControl}>
          <Text style={styles.secondaryControlText}>불편함 기록</Text>
        </Pressable>
        <Pressable onPress={onCompleteSet} style={styles.primaryControl}>
          <Text style={styles.primaryControlText}>{isLastSet ? '세트 완료' : '다음'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onSkip} style={styles.skipLink}>
        <Text style={styles.skipLinkText}>지금 운동 건너뛰기</Text>
        <RightIcon color={colors.primaryDark} height={22} width={22} />
      </Pressable>
    </View>
  );
}

function RestContent({
  addRestSeconds,
  layout,
  onSkip,
  session,
  skipRest,
  togglePause,
}: {
  addRestSeconds: (seconds: number) => void;
  layout: SessionLayout;
  onSkip: () => void;
  session: ExerciseSessionState;
  skipRest: () => void;
  togglePause: () => void;
}) {
  const remainingSeconds = Math.ceil(session.restRemainingMs / 1000);
  const progress =
    session.restTotalMs > 0
      ? Math.max(0, Math.min(1, session.restRemainingMs / session.restTotalMs))
      : 0;
  const radius = 119;
  const circumference = 2 * Math.PI * radius;
  return (
    <>
      <View style={[styles.restHeading, { top: layout.restTitleTop }]}>
        <Text style={styles.restTitle}>휴식</Text>
        <Text style={styles.restDescription}>다음 세트를 위해{`\n`}휴식을 취하세요.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={togglePause}
        style={[styles.restCircle, { top: layout.restCircleTop }]}
      >
        <Svg
          height={250}
          pointerEvents="none"
          style={styles.restProgressRing}
          viewBox="0 0 250 250"
          width={250}
        >
          <Circle cx="125" cy="125" fill="none" r={radius} stroke="#EEEEEE" strokeWidth="12" />
          <Circle
            cx="125"
            cy="125"
            fill="none"
            originX="125"
            originY="125"
            r={radius}
            rotation="-90"
            stroke={colors.primary}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            strokeWidth="12"
            x="0"
            y="0"
          />
        </Svg>
        <Text style={styles.restTimer}>{formatClock(remainingSeconds, true)}</Text>
        {session.paused ? (
          <PlayIcon color={colors.primary} height={49} width={49} />
        ) : (
          <PauseIcon color={colors.primary} height={49} width={49} />
        )}
      </Pressable>
      <Pressable
        onPress={() => addRestSeconds(10)}
        style={[styles.addRestButton, { top: layout.restCircleTop + 275 }]}
      >
        <Text style={styles.addRestText}>+ 10초</Text>
      </Pressable>
      <View style={[styles.restControls, { top: layout.buttonsTop }]}>
        <Pressable onPress={skipRest} style={styles.restSkipButton}>
          <Text style={styles.restSkipText}>휴식 건너뛰기</Text>
        </Pressable>
        <Pressable onPress={onSkip} style={styles.skipLink}>
          <Text style={styles.skipLinkText}>지금 운동 건너뛰기</Text>
          <RightIcon color={colors.primaryDark} height={22} width={22} />
        </Pressable>
      </View>
    </>
  );
}

function ExerciseCompletedContent({
  exercise,
  layout,
  onNext,
  session,
}: {
  exercise: ExerciseSessionExercise;
  layout: SessionLayout;
  onNext: () => void;
  session: ExerciseSessionState;
}) {
  const result = session.results[session.results.length - 1];
  return (
    <>
      <View style={[styles.completionHeading, { top: layout.completionTitleTop }]}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.completionTitle}>
          {exercise.name} 완료!
        </Text>
        <Text style={styles.completionDescription}>
          {session.currentExerciseIndex + 1}번째 운동을 완료했어요.
        </Text>
      </View>
      <Image
        resizeMode="contain"
        source={finishOneImage}
        style={[
          styles.completionImage,
          {
            height: layout.completionImageSize,
            top: layout.completionImageTop,
            width: layout.completionImageSize,
          },
        ]}
      />
      <View
        style={[
          styles.resultCard,
          { height: layout.completionCardHeight, top: layout.completionCardTop },
        ]}
      >
        <ResultFactor
          Icon={ClockIcon}
          label="운동 시간"
          value={formatClock(result?.elapsedSeconds ?? 0)}
        />
        <ResultFactor
          Icon={BarbellIcon}
          label="완료 세트"
          value={`${result?.completedSets ?? exercise.totalSets}세트`}
        />
        <ResultFactor
          Icon={FireIcon}
          last
          label="소모 칼로리"
          value={result?.caloriesBurned === null ? '-' : `${result?.caloriesBurned ?? '-'} kcal`}
        />
      </View>
      <View style={[styles.completionButton, { top: layout.completionButtonTop }]}>
        <ExerciseActionButton
          borderRadius={10}
          gap={0}
          gradient
          icon={<View />}
          labelStyle={styles.completionButtonText}
          onPress={onNext}
          title="다음"
        />
      </View>
    </>
  );
}

function ResultFactor({
  Icon,
  label,
  last = false,
  value,
}: {
  Icon: typeof ClockIcon;
  label: string;
  last?: boolean;
  value: string;
}) {
  return (
    <View style={[styles.resultFactor, !last && styles.resultDivider]}>
      <Icon color={colors.primary} height={27} width={27} />
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

function AllCompletedContent({
  allSkipped,
  disabled,
  layout,
  onFinish,
  session,
  summary,
}: {
  allSkipped: boolean;
  disabled: boolean;
  layout: SessionLayout;
  onFinish: () => void;
  session: ExerciseSessionState;
  summary: { completedCount: number; skippedCount: number };
}) {
  const description = allSkipped
    ? `건너뛴 운동 ${summary.skippedCount}개`
    : summary.skippedCount > 0
      ? `완료 ${summary.completedCount}개 · 건너뜀 ${summary.skippedCount}개`
      : '모든 운동을 완료했어요.';
  const completionImageSize = allSkipped
    ? layout.completionImageSize * skippedCompletionIllustrationScale
    : layout.completionImageSize;
  const completionImageTop = allSkipped
    ? layout.completionImageTop - (completionImageSize - layout.completionImageSize) / 2
    : layout.completionImageTop;
  return (
    <>
      <View style={[styles.completionHeading, { top: layout.completionTitleTop }]}>
        <Text style={styles.completionTitle}>
          {allSkipped ? '오늘 운동을 종료했어요' : '오늘의 운동 완료!'}
        </Text>
        <Text style={styles.completionDescription}>{description}</Text>
      </View>
      <Image
        resizeMode="contain"
        source={allSkipped ? skipAllImage : finishAllImage}
        style={[
          styles.completionImage,
          {
            height: completionImageSize,
            top: completionImageTop,
            width: completionImageSize,
          },
        ]}
      />
      <View style={[styles.encouragementCard, { top: layout.completionCardTop }]}>
        <Image
          resizeMode="contain"
          source={allSkipped ? skipBadgeImage : completeBadgeImage}
          style={styles.encouragementImage}
        />
        <View style={styles.encouragementCopy}>
          <Text style={styles.encouragementTitle}>
            {allSkipped ? '오늘은 수행한 운동이 없어요.' : '정말 멋져요!'}
          </Text>
          <Text style={styles.encouragementText}>
            {allSkipped
              ? '컨디션을 확인하고 다음 운동을 준비해보세요.'
              : '꾸준한 운동 습관이 더 건강한 내일을 만듭니다.\n내일도 함께해요!'}
          </Text>
        </View>
      </View>
      <View
        pointerEvents={disabled ? 'none' : 'auto'}
        style={[styles.completionButton, { top: layout.buttonsTop }, disabled && styles.disabled]}
      >
        <ExerciseActionButton
          borderRadius={10}
          gap={0}
          gradient
          icon={<View />}
          labelStyle={styles.completionButtonText}
          onPress={onFinish}
          title={allSkipped ? '운동 홈으로' : '운동 결과 기록하기'}
        />
      </View>
      <Text accessibilityElementsHidden style={styles.hiddenExerciseName}>
        {session.exercises.length}
      </Text>
    </>
  );
}

function AdjustmentIndicatorOverlay({
  onCovered,
  onFinished,
}: {
  onCovered: () => void;
  onFinished: () => void;
}) {
  const progress = useTemporaryAdjustmentProgress();
  const [opacity] = useState(() => new Animated.Value(0));
  const coveredRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished && !coveredRef.current) {
        coveredRef.current = true;
        onCovered();
      }
    });

    return () => animation.stop();
  }, [onCovered, opacity]);

  useEffect(() => {
    if (progress < 1 || finishedRef.current) return undefined;

    finishedRef.current = true;
    let fadeOut: Animated.CompositeAnimation | undefined;
    const completionHold = setTimeout(() => {
      fadeOut = Animated.timing(opacity, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
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
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.adjustmentTransitionLayer, { opacity }]}
      >
        <AdjustmentIndicatorView progress={progress} />
      </Animated.View>
    </Modal>
  );
}

function DiscomfortRecordModal({
  isClosing,
  onClose,
  onClosed,
  onRequestAdjust,
  onRequestEnd,
}: {
  isClosing: boolean;
  onClose: () => void;
  onClosed: () => void;
  onRequestAdjust: (draft: DiscomfortFeedbackDraft) => void;
  onRequestEnd: () => void;
}) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const [stableViewportHeight] = useState(viewportHeight);
  const discomfortScrollRef = useRef<ScrollView>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const focusedInputKindRef = useRef<FocusedDiscomfortInput>(null);
  const otherDescriptionInputRef = useRef<TextInput>(null);
  const otherDescriptionHintRef = useRef<View>(null);
  const painAreaInputRef = useRef<TextInput>(null);
  const scrollOffsetRef = useRef(0);
  const keyboardTopRef = useRef(Number.POSITIVE_INFINITY);
  const [selectedFeedbackType, setSelectedFeedbackType] = useState<DiscomfortFeedbackType>('pain');
  const [feedbackLevel, setFeedbackLevel] = useState(5);
  const [painArea, setPainArea] = useState('');
  const [otherDescription, setOtherDescription] = useState('');
  const [followUpChoice, setFollowUpChoice] = useState<FollowUpChoice>('adjust');
  const [focusedInputVersion, setFocusedInputVersion] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [animationProgress] = useState(() => new Animated.Value(0));
  const selectedOption =
    discomfortFeedbackOptions.find((option) => option.value === selectedFeedbackType) ??
    discomfortFeedbackOptions[0];
  const widthScale = Math.min(1, viewportWidth / 412);
  const scaledCanvasHeight = stableViewportHeight / Math.max(widthScale, 0.01);
  const canvasLeft = (viewportWidth - 412 * widthScale) / 2;
  const modalHeight = Math.min(857, Math.max(700, scaledCanvasHeight - 60));

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardTopRef.current = Number.POSITIVE_INFINITY;
      setKeyboardHeight(0);
      scrollOffsetRef.current = 0;
      discomfortScrollRef.current?.scrollTo({ animated: true, y: 0 });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight <= 0) return undefined;

    const frame = requestAnimationFrame(() => {
      const focusedInput = focusedInputRef.current;
      if (!focusedInput) return;

      const isOtherDescription = focusedInputKindRef.current === 'other';
      const visibilityTarget = isOtherDescription
        ? (otherDescriptionHintRef.current ?? focusedInput)
        : focusedInput;
      const bottomClearance = isOtherDescription ? 20 : 16;

      visibilityTarget.measureInWindow((_x, y, _width, height) => {
        const overlap = y + height + bottomClearance - keyboardTopRef.current;
        if (overlap <= 0) return;
        discomfortScrollRef.current?.scrollTo({
          animated: true,
          y: scrollOffsetRef.current + overlap / Math.max(widthScale, 0.01),
        });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [focusedInputVersion, keyboardHeight, widthScale]);

  useEffect(() => {
    Animated.timing(animationProgress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [animationProgress]);

  useEffect(() => {
    if (!isClosing) return;

    Animated.timing(animationProgress, {
      duration: 170,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClosed();
    });
  }, [animationProgress, isClosing, onClosed]);

  const handleInputFocus = (
    input: TextInput | null,
    kind: Exclude<FocusedDiscomfortInput, null>,
  ) => {
    focusedInputRef.current = input;
    focusedInputKindRef.current = kind;
    setFocusedInputVersion((version) => version + 1);
  };

  const selectFeedbackType = (type: DiscomfortFeedbackType) => {
    setSelectedFeedbackType(type);
    setFeedbackLevel(5);
    setPainArea('');
    setOtherDescription('');
  };

  const submitFeedback = () => {
    if (followUpChoice === 'end') {
      onRequestEnd();
      return;
    }
    onRequestAdjust({
      feedbackLevel,
      feedbackType: selectedFeedbackType,
      otherDescription,
      painArea,
    });
  };

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.discomfortModalViewport}>
        <Pressable onPress={onClose} style={styles.discomfortModalDimHitArea}>
          <Animated.View
            pointerEvents="none"
            style={[styles.discomfortModalDim, { opacity: animationProgress }]}
          />
        </Pressable>
        <View
          pointerEvents="box-none"
          style={[
            styles.discomfortModalCanvas,
            {
              height: scaledCanvasHeight,
              left: canvasLeft,
              transform: [{ scale: widthScale }],
            },
          ]}
        >
          <Animated.View
            pointerEvents={isClosing ? 'none' : 'auto'}
            style={[
              styles.discomfortModalCard,
              {
                height: modalHeight,
                opacity: animationProgress,
                transform: [
                  {
                    scale: animationProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.97, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.discomfortModalHeader}>
              <Text maxFontSizeMultiplier={1} style={styles.discomfortModalTitle}>
                지금 달라진 상태를{`\n`}알려주세요
              </Text>
              <Image
                resizeMode="contain"
                source={modifyImage}
                style={styles.discomfortModifyImage}
              />
              <Pressable onPress={onClose} style={styles.discomfortCloseButton}>
                <XIcon color={colors.primaryDark} height={17} width={17} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.discomfortScrollContainer}
              keyboardShouldPersistTaps="handled"
              onScroll={(event) => {
                scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              }}
              ref={discomfortScrollRef}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={styles.discomfortScroll}
            >
              <View style={[styles.discomfortModalContent, { height: modalHeight - 317 }]}>
                <DiscomfortSectionTitle title="어떤 변화가 있나요?" />
                <View style={styles.discomfortTypeGrid}>
                  {[discomfortFeedbackOptions.slice(0, 3), discomfortFeedbackOptions.slice(3)].map(
                    (row, rowIndex) => (
                      <View key={rowIndex} style={styles.discomfortTypeRow}>
                        {row.map((option) => {
                          const selected = selectedFeedbackType === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => selectFeedbackType(option.value)}
                              style={[
                                styles.discomfortTypeChip,
                                selected && styles.discomfortTypeChipSelected,
                              ]}
                            >
                              <Text
                                maxFontSizeMultiplier={1}
                                style={[
                                  styles.discomfortTypeChipText,
                                  selected && styles.discomfortTypeChipTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ),
                  )}
                </View>
                <View style={styles.discomfortDivider} />
                {selectedFeedbackType === 'other' ? (
                  <View style={styles.discomfortSection}>
                    <DiscomfortSectionTitle title="어떤 변화가 있었나요?" />
                    <View style={styles.discomfortTextInputWrap}>
                      <TextInput
                        maxFontSizeMultiplier={1}
                        maxLength={100}
                        multiline
                        onChangeText={setOtherDescription}
                        onFocus={() => handleInputFocus(otherDescriptionInputRef.current, 'other')}
                        placeholder="느껴지는 불편함을 입력해주세요."
                        placeholderTextColor={colors.textDisabled}
                        ref={otherDescriptionInputRef}
                        style={styles.discomfortTextInput}
                        textAlignVertical="top"
                        value={otherDescription}
                      />
                      <Text maxFontSizeMultiplier={1} style={styles.discomfortCharacterCount}>
                        {otherDescription.length} / 100
                      </Text>
                    </View>
                    <View collapsable={false} ref={otherDescriptionHintRef}>
                      <Text maxFontSizeMultiplier={1} style={styles.discomfortInputHint}>
                        예시 : 메스꺼움, 식은땀, 두근거림, 손발 저림 등
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.discomfortSection}>
                    <View style={styles.discomfortLevelHeader}>
                      <DiscomfortSectionTitle title={selectedOption.levelLabel} />
                      <Text maxFontSizeMultiplier={1} style={styles.discomfortLevelValue}>
                        {feedbackLevel}{' '}
                        <Text maxFontSizeMultiplier={1} style={styles.discomfortLevelTotal}>
                          / 10
                        </Text>
                      </Text>
                    </View>
                    <DiscomfortLevelSlider
                      endLabel={selectedOption.endLabel}
                      onChange={setFeedbackLevel}
                      startLabel={selectedOption.startLabel}
                      value={feedbackLevel}
                    />
                  </View>
                )}
                {selectedFeedbackType === 'pain' ? (
                  <>
                    <View style={styles.discomfortDivider} />
                    <View style={styles.discomfortSection}>
                      <DiscomfortSectionTitle title="변화가 느껴지는 부위" />
                      <TextInput
                        maxFontSizeMultiplier={1}
                        maxLength={50}
                        onChangeText={setPainArea}
                        onFocus={() => handleInputFocus(painAreaInputRef.current, 'pain')}
                        placeholder="불편한 부위를 입력해주세요 (예: 오른쪽 무릎)"
                        placeholderTextColor={colors.textDisabled}
                        ref={painAreaInputRef}
                        style={styles.painAreaInput}
                        value={painArea}
                      />
                    </View>
                  </>
                ) : null}
                <View style={styles.discomfortDivider} />
                <View style={styles.discomfortSection}>
                  <DiscomfortSectionTitle title="남은 운동을 어떻게 할까요?" />
                  <View style={styles.followUpChoices}>
                    <FollowUpChoiceButton
                      label="운동 조정하기"
                      onPress={() => setFollowUpChoice('adjust')}
                      selected={followUpChoice === 'adjust'}
                    />
                    <FollowUpChoiceButton
                      label="오늘 운동 종료"
                      onPress={() => setFollowUpChoice('end')}
                      selected={followUpChoice === 'end'}
                    />
                  </View>
                </View>
              </View>
              {keyboardHeight > 0 ? (
                <View style={{ height: keyboardHeight / Math.max(widthScale, 0.01) + 16 }} />
              ) : null}
            </ScrollView>
            <View style={styles.discomfortInfoCard}>
              <View style={styles.discomfortInfoIcon}>
                <LightbulbIcon color={colors.primaryDark} height={25} width={25} />
              </View>
              <View style={styles.discomfortInfoCopy}>
                <Text maxFontSizeMultiplier={1} style={styles.discomfortInfoTitle}>
                  맞춤 조정 안내
                </Text>
                <Text maxFontSizeMultiplier={1} style={styles.discomfortInfoText}>
                  {selectedOption.info}
                </Text>
              </View>
            </View>
            <View style={styles.discomfortSubmitButton}>
              <ExerciseActionButton
                borderRadius={50}
                gap={10}
                gradient
                icon={
                  <View style={styles.discomfortSubmitIcon}>
                    <CheckIcon color={colors.primaryDark} height={13} width={13} />
                  </View>
                }
                labelStyle={styles.discomfortSubmitText}
                maxFontSizeMultiplier={1}
                onPress={submitFeedback}
                title={followUpChoice === 'adjust' ? '조정된 운동 확인하기' : '종료하기'}
              />
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function DiscomfortSectionTitle({ title }: { title: string }) {
  return (
    <Text maxFontSizeMultiplier={1} style={styles.discomfortSectionTitle}>
      {title}
    </Text>
  );
}

function DiscomfortLevelSlider({
  endLabel,
  onChange,
  startLabel,
  value,
}: {
  endLabel: string;
  onChange: (value: number) => void;
  startLabel: string;
  value: number;
}) {
  const trackWidthRef = useRef(340);
  const percentage = (Math.min(10, Math.max(0, value)) / 10) * 100;
  const updateValueFromPosition = (locationX: number) => {
    const trackWidth = Math.max(1, trackWidthRef.current);
    const clampedPosition = Math.min(trackWidth, Math.max(0, locationX));
    onChange(Math.min(10, Math.max(0, Math.round((clampedPosition / trackWidth) * 10))));
  };

  return (
    <View>
      <View
        hitSlop={{ bottom: 10, left: 4, right: 4, top: 10 }}
        onLayout={(event) => {
          trackWidthRef.current = event.nativeEvent.layout.width;
        }}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => updateValueFromPosition(event.nativeEvent.locationX)}
        onResponderMove={(event) => updateValueFromPosition(event.nativeEvent.locationX)}
        onResponderRelease={(event) => updateValueFromPosition(event.nativeEvent.locationX)}
        onResponderTerminationRequest={() => false}
        onStartShouldSetResponder={() => true}
        style={styles.discomfortSliderTrack}
      >
        <View pointerEvents="none" style={styles.discomfortSliderInactive} />
        <View
          pointerEvents="none"
          style={[styles.discomfortSliderFill, { width: `${percentage}%` }]}
        />
        <View
          pointerEvents="none"
          style={[styles.discomfortSliderThumb, { left: `${percentage}%` }]}
        />
      </View>
      <View style={styles.discomfortSliderLabels}>
        <Text maxFontSizeMultiplier={1} style={styles.discomfortSliderLabel}>
          {startLabel}
        </Text>
        <Text maxFontSizeMultiplier={1} style={styles.discomfortSliderLabel}>
          {endLabel}
        </Text>
      </View>
    </View>
  );
}

function FollowUpChoiceButton({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.followUpChoice, selected && styles.followUpChoiceSelected]}
    >
      <Text
        maxFontSizeMultiplier={1}
        style={[styles.followUpChoiceText, selected && styles.followUpChoiceTextSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ConfirmationModal({
  cancelLabel = '계속하기',
  confirmLabel,
  contentHeight,
  description,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  contentHeight: number;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <View style={[styles.modalLayer, { height: contentHeight }]}>
      <View style={styles.modalDim} />
      <View style={styles.modalCard}>
        <View style={styles.modalIcon}>
          <WarningIcon color={colors.primaryDark} height={30} width={30} />
        </View>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalDescription}>{description}</Text>
        <View style={styles.modalButtons}>
          <Pressable onPress={onCancel} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable onPress={onConfirm} style={styles.modalConfirmButton}>
            <Text style={styles.modalConfirmText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  adjustmentTransitionLayer: {
    backgroundColor: colors.background,
  },
  addRestButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 7,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    width: 80,
  },
  addRestText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
  },
  back: { left: 21, position: 'absolute', top: 31 },
  blueTag: {
    backgroundColor: '#EEF4FF',
    borderColor: '#AFC8FF',
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blueTagText: {
    color: '#4F7FE8',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
  },
  completionButton: { left: 21, position: 'absolute', width: 370 },
  completionButtonText: {
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
    lineHeight: 24,
  },
  completionDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    marginTop: 13,
  },
  completionHeading: {
    alignItems: 'center',
    left: 21,
    position: 'absolute',
    width: 370,
  },
  completionImage: { alignSelf: 'center', position: 'absolute' },
  completionTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 36,
    includeFontPadding: false,
    textAlign: 'center',
    width: '100%',
  },
  controlRow: { flexDirection: 'row', gap: 10, width: '100%' },
  controls: { alignItems: 'flex-end', gap: 17, left: 21, position: 'absolute', width: 370 },
  disabled: { opacity: 0.65 },
  discomfortCharacterCount: {
    bottom: 8,
    color: colors.textDisabled,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 15,
    position: 'absolute',
    right: 10,
  },
  discomfortCloseButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    left: 332,
    position: 'absolute',
    top: 14,
    width: 32,
  },
  discomfortDivider: {
    backgroundColor: colors.border,
    height: 1,
    width: '100%',
  },
  discomfortInfoCard: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    bottom: 104,
    flexDirection: 'row',
    gap: 10,
    left: 20,
    minHeight: 78,
    padding: 12,
    position: 'absolute',
    width: 340,
  },
  discomfortInfoCopy: { flex: 1, gap: 2 },
  discomfortInfoIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  discomfortInfoText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 17,
  },
  discomfortInfoTitle: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
  },
  discomfortInputHint: {
    color: colors.textDisabled,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 17,
    marginTop: -7,
  },
  discomfortLevelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  discomfortLevelValue: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    includeFontPadding: false,
    lineHeight: 24,
  },
  discomfortLevelTotal: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 17,
    lineHeight: 21,
  },
  discomfortModalCanvas: {
    position: 'absolute',
    top: 0,
    transformOrigin: 'top left',
    width: 412,
  },
  discomfortModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 25,
    elevation: 10,
    left: 16,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    top: 30,
    width: 380,
  },
  discomfortModalContent: {
    justifyContent: 'space-between',
    padding: 20,
    width: '100%',
  },
  discomfortModalDim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  discomfortModalDimHitArea: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  discomfortModalHeader: {
    backgroundColor: 'rgba(232,248,244,0.5)',
    height: 120,
    overflow: 'hidden',
    position: 'relative',
  },
  discomfortModalTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
    includeFontPadding: false,
    left: 25,
    lineHeight: 28,
    position: 'absolute',
    top: 32,
    width: 180,
  },
  discomfortModalViewport: { flex: 1 },
  discomfortModifyImage: { height: 110, left: 241, position: 'absolute', top: 5, width: 114 },
  discomfortSection: { gap: 10, width: '100%' },
  discomfortSectionTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 22,
  },
  discomfortScroll: {
    bottom: 190,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 127,
  },
  discomfortScrollContainer: { width: '100%' },
  discomfortSliderFill: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 6,
    left: 0,
    position: 'absolute',
    top: 7,
  },
  discomfortSliderInactive: {
    backgroundColor: colors.border,
    borderRadius: 3,
    height: 6,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 7,
  },
  discomfortSliderLabel: {
    color: colors.textDisabled,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 18,
  },
  discomfortSliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  discomfortSliderThumb: {
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    marginLeft: -10,
    position: 'absolute',
    shadowColor: colors.primaryDark,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    top: 0,
    width: 20,
  },
  discomfortSliderTrack: {
    height: 20,
    marginTop: 2,
    position: 'relative',
    width: '100%',
  },
  discomfortSubmitButton: {
    backgroundColor: colors.primary,
    borderRadius: 50,
    bottom: 42,
    elevation: 4,
    height: 45,
    left: 15,
    position: 'absolute',
    shadowColor: colors.primaryDark,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    width: 350,
  },
  discomfortSubmitIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  discomfortSubmitText: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 23,
  },
  discomfortTextInput: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    height: '100%',
    includeFontPadding: false,
    lineHeight: 19,
    paddingBottom: 25,
    paddingHorizontal: 10,
    paddingTop: 10,
    width: '100%',
  },
  discomfortTextInputWrap: {
    backgroundColor: '#F6F6F6',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 100,
    position: 'relative',
    width: '100%',
  },
  discomfortTypeChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 15,
    width: 108.66,
  },
  discomfortTypeChipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  discomfortTypeChipText: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
  },
  discomfortTypeChipTextSelected: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  discomfortTypeGrid: { gap: 7, height: 79, width: '100%' },
  discomfortTypeRow: { flexDirection: 'row', gap: 7, height: 36, width: '100%' },
  encouragementCard: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 15,
    flexDirection: 'row',
    height: 100,
    left: 21,
    paddingHorizontal: 10,
    position: 'absolute',
    width: 370,
  },
  encouragementCopy: { flex: 1, gap: 10, marginLeft: 10 },
  encouragementImage: { height: 70, width: 70 },
  encouragementText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  encouragementTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
  },
  exerciseHeading: { gap: 5, maxWidth: 155 },
  exerciseIdentity: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  exerciseName: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    includeFontPadding: false,
    letterSpacing: 1,
  },
  exerciseNumber: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  exerciseNumberText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
  },
  followUpChoice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  followUpChoiceSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  followUpChoiceText: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
  },
  followUpChoiceTextSelected: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  followUpChoices: { flexDirection: 'row', gap: 7, width: '100%' },
  goldTag: {
    backgroundColor: '#FFF8E8',
    borderColor: '#EED99E',
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  goldTagText: {
    color: '#C8952F',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
  },
  guideButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 15,
    flexDirection: 'row',
    paddingLeft: 8,
  },
  guideIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryMedium,
    borderRadius: 999,
    height: 27,
    justifyContent: 'center',
    marginLeft: 5,
    width: 27,
  },
  guideText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 14,
  },
  hiddenExerciseName: { height: 0, opacity: 0, position: 'absolute', width: 0 },
  mediaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'space-between',
    left: 21,
    paddingBottom: 22,
    paddingHorizontal: 17,
    paddingTop: 18,
    position: 'absolute',
    width: 370,
  },
  mediaHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  mediaImage: { height: '100%', width: '100%' },
  mediaImageArea: {
    backgroundColor: '#EEF5F3',
    borderRadius: 15,
    overflow: 'hidden',
    position: 'relative',
    width: 334,
  },
  modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
  modalCancelButton: {
    alignItems: 'center',
    borderColor: '#D9D9D9',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#6C757D',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
  },
  modalCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 15,
    height: 230,
    justifyContent: 'center',
    left: 56,
    paddingHorizontal: 24,
    position: 'absolute',
    top: '37%',
    width: 300,
  },
  modalConfirmButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 14,
  },
  modalDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  modalDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  modalLayer: { left: 0, position: 'absolute', top: 0, width: 412, zIndex: 50 },
  modalTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  playCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    height: 55,
    justifyContent: 'center',
    left: 139,
    position: 'absolute',
    top: '37%',
    width: 55,
  },
  painAreaInput: {
    backgroundColor: '#FAFAFA',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    height: 45,
    includeFontPadding: false,
    lineHeight: 19,
    paddingHorizontal: 15,
    width: '100%',
  },
  primaryControl: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    height: 45,
    justifyContent: 'center',
    width: 180,
  },
  primaryControlText: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
  },
  progressCurrent: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    letterSpacing: 2,
  },
  progressFill: { backgroundColor: colors.primary, borderRadius: 4, height: 7 },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    left: 21,
    position: 'absolute',
    top: 77,
    width: 370,
  },
  progressTotal: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
  },
  progressTrack: {
    backgroundColor: '#E8E8E8',
    borderRadius: 4,
    flex: 1,
    height: 7,
    marginLeft: 13,
    overflow: 'hidden',
  },
  repCount: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 55,
    letterSpacing: 3,
  },
  repGoal: { fontSize: 25, letterSpacing: 1 },
  repProgress: {
    alignItems: 'center',
    left: 21,
    position: 'absolute',
    width: 370,
  },
  restCircle: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 250,
    justifyContent: 'center',
    position: 'absolute',
    width: 250,
  },
  restProgressRing: { height: 250, position: 'absolute', width: 250 },
  restControls: { alignItems: 'flex-end', gap: 17, left: 21, position: 'absolute', width: 370 },
  restDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 20,
    marginTop: 13,
    textAlign: 'center',
  },
  restHeading: { alignItems: 'center', left: 21, position: 'absolute', width: 370 },
  restSkipButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    height: 45,
    justifyContent: 'center',
    width: '100%',
  },
  restSkipText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
  },
  restTimer: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 35,
    letterSpacing: -1,
    marginBottom: 12,
  },
  restTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 36,
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    height: 110,
    left: 21,
    paddingBottom: 12,
    paddingTop: 12,
    position: 'absolute',
    width: 370,
  },
  resultDivider: { borderRightColor: colors.border, borderRightWidth: 1 },
  resultFactor: { alignItems: 'center', flex: 1, gap: 7, height: 82 },
  resultLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
  },
  resultValue: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
  },
  screenTitle: {
    alignSelf: 'center',
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    letterSpacing: 1.5,
    position: 'absolute',
    top: 38,
  },
  secondaryControl: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    height: 45,
    justifyContent: 'center',
    width: 180,
  },
  secondaryControlText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 20,
  },
  setActive: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
  },
  setDescription: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  setTotal: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 20,
  },
  shortDivider: { backgroundColor: colors.border, height: 20, width: 1 },
  skipLink: { alignItems: 'center', flexDirection: 'row' },
  skipLinkText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
  },
  speedButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 5,
    height: 30,
    paddingHorizontal: 10,
  },
  speedButtonText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
  },
  tagRow: { flexDirection: 'row', gap: 5 },
  timedButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryMedium,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    height: 60,
    justifyContent: 'center',
    width: 230,
  },
  timedProgress: {
    alignItems: 'center',
    gap: 25,
    left: 21,
    position: 'absolute',
    width: 370,
  },
  timedText: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 30,
    letterSpacing: 3,
  },
  timerDot: { backgroundColor: colors.primary, borderRadius: 999, height: 10, width: 10 },
  tipCard: {
    alignItems: 'center',
    backgroundColor: '#EBF4F2',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 15,
    left: 21,
    paddingHorizontal: 15,
    position: 'absolute',
    width: 370,
  },
  tipCopy: { flex: 1, gap: 5 },
  tipIconCircle: {
    alignItems: 'center',
    backgroundColor: '#D1EBE5',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  tipText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  tipTitle: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
  },
  topTimer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    right: 21,
    top: 31,
  },
  topTimerText: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
    letterSpacing: 2,
  },
});
