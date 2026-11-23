import { logError } from '@/src/lib/logError';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ApiError } from '@/src/api/client';
import { getExerciseApiErrorMessage, recordExerciseDiscomfort, stopExerciseSession } from '@/src/api/exercise';
import { Text } from '@/src/components/common';
import { aForm } from '@/src/components/a/form';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { R6ExerciseSession, type DiscomfortReport } from '@/src/components/exercise/R6ExerciseSession';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { loadVoiceGuideSettings, speakGuide } from '@/src/features/exercise/voiceGuide';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

export default function ExerciseSessionScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { markRoutineCompleted, refreshHome, resultRecordCompleted } = useExerciseRoutine();
  const {
    addRestSeconds,
    applyAdjustedItems,
    clearSession,
    closeExitConfirmation,
    closeSkipConfirmation,
    completeCurrentSet,
    completeSession,
    currentExercise,
    flushPendingResults,
    recordSymptomStop,
    retrySymptomStop,
    cycleCountSpeed,
    goToNextExercise,
    openExitConfirmation,
    openSkipConfirmation,
    session,
    setAdjustmentPending,
    skipRest,
    skipCurrentExercise,
    togglePause,
  } = useExerciseSession();
  const [finishFailed, setFinishFailed] = useState(false);
  const finishing = useRef(false);
  const stopping = useRef(false);
  const [stopBusy, setStopBusy] = useState(false);
  const phase = session?.phase;
  const hasSession = session !== null;
  const exitConfirmationVisible = session?.exitConfirmationVisible ?? false;
  const skipConfirmationVisible = session?.skipConfirmationVisible ?? false;

  useEffect(() => {
    if (session?.phase !== 'rest' || session.paused) return;
    let active = true;
    void loadVoiceGuideSettings().then((settings) => {
      if (active && settings.announceRest) {
        speakGuide(
          `쉬는 시간이에요. ${Math.ceil(session.restTotalMs / 1000)}초 쉬어 주세요.`,
          settings,
        );
      }
    });
    return () => {
      active = false;
    };
  }, [
    session?.phase,
    session?.paused,
    session?.restTotalMs,
    session?.currentExerciseIndex,
    session?.currentSet,
  ]);

  const reportDiscomfort = useCallback(
    async (report: DiscomfortReport) => {
      if (!session || !currentExercise) return null;
      setAdjustmentPending(session.sessionId, true);
      try {
        await flushPendingResults();
        const response = await recordExerciseDiscomfort(session.sessionId, {
          actionTaken: 'adjust',
          bodyAreas: report.bodyAreas,
          detail: report.detail,
          exerciseItemId: currentExercise.id,
          severity: report.severity,
          symptomType: report.symptomType,
        });
        const adjustedItems = response.result?.adjusted_items;
        if (!Array.isArray(adjustedItems)) {
          throw new Error('조정된 운동 정보를 확인할 수 없어요.');
        }
        if (adjustedItems.length > 0) applyAdjustedItems(session.sessionId, adjustedItems);
        return adjustedItems.length;
      } catch (error) {
        logError('Exercise adjustment failed', error);
        Alert.alert('운동 조정 실패', getExerciseApiErrorMessage(error));
        return null;
      } finally {
        setAdjustmentPending(session.sessionId, false);
      }
    },
    [applyAdjustedItems, currentExercise, flushPendingResults, session, setAdjustmentPending],
  );

  const finish = useCallback(async () => {
    if (finishing.current || !session) return;
    finishing.current = true;
    const allSkipped = session.phase === 'all-skipped';
    try {
      const completedSummary = await completeSession();
      // A saved routine is not today's recommended workout, so that one stays as it was.
      if (!session.savedRoutine) markRoutineCompleted({
        calories: completedSummary.calories,
        durationMinutes: completedSummary.durationMinutes,
        itemCount: completedSummary.completedCount,
        sessionId: session.sessionId,
      });
      if (allSkipped) {
        clearSession();
        requestAnimationFrame(() => router.replace('/exercise'));
      } else {
        // Keep the completed session until the result screen saves feedback.
        requestAnimationFrame(() => router.replace('/exercise/completion'));
      }
    } catch (error) {
      logError('Exercise session completion failed', error);
      setFinishFailed(true);
      Alert.alert('운동 결과 저장 실패', getExerciseApiErrorMessage(error));
    } finally {
      finishing.current = false;
    }
  }, [clearSession, completeSession, markRoutineCompleted, router, session]);

  // Figma moves straight to the next exercise and then to the result screen.
  useEffect(() => {
    if (phase === 'exercise-completed') goToNextExercise();
    // goToNextExercise is recreated on every context update; the phase alone decides this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.currentExerciseIndex]);
  useEffect(() => {
    if (phase !== 'all-completed' && phase !== 'all-skipped') return undefined;
    const frame = requestAnimationFrame(() => void finish());
    return () => cancelAnimationFrame(frame);
    // finish changes with every timer tick; it should run once per phase change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (session || resultRecordCompleted) return undefined;
    const frame = requestAnimationFrame(() => router.replace('/exercise/summary'));
    return () => cancelAnimationFrame(frame);
  }, [resultRecordCompleted, router, session]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !hasSession) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stopping.current) return true; // a stop is being sent: the workout must not resume under it
      if (skipConfirmationVisible) closeSkipConfirmation();
      else if (exitConfirmationVisible) closeExitConfirmation();
      else openExitConfirmation();
      return true;
    });
    return () => subscription.remove();
  }, [
    closeExitConfirmation,
    closeSkipConfirmation,
    exitConfirmationVisible,
    hasSession,
    openExitConfirmation,
    skipConfirmationVisible,
  ]);

  if (!session || !currentExercise) return <View style={styles.root} />;

  // Leaves without telling the server: after a symptom stop, which has already stopped the session.
  const leaveSession = () => {
    clearSession();
    requestAnimationFrame(() => router.dismissTo(session.savedRoutine ? '/exercise/saved-routines' : '/exercise/summary'));
  };

  // The user's '운동 중단' (back-end 8d2b2d9). The screen and the local session stay until the server says
  // stopped, so a failed request can be tried again with the same session. Closing the app never calls this.
  const stopWorkout = async () => {
    if (stopping.current) return;
    stopping.current = true;
    setStopBusy(true);
    try {
      await flushPendingResults(); // finished moves are recorded before the rest is marked skipped
      const answer = await stopExerciseSession(session.sessionId);
      if (answer.result?.session?.status !== 'stopped') throw new Error('운동 중단을 확인하지 못했어요.');
      void refreshHome();
      leaveSession();
    } catch (error) {
      const code = error instanceof ApiError ? (error.detail as { code?: unknown } | null | undefined)?.code : undefined;
      if (code === 'EXERCISE_SESSION_NOT_FOUND' || code === 'EXERCISE_SESSION_NOT_STOPPABLE') {
        // Already finished or gone on the server: follow the server.
        void refreshHome();
        Alert.alert('이미 끝난 운동이에요', '운동 기록에서 결과를 확인해 주세요.');
        leaveSession();
        return;
      }
      logError('Exercise stop failed', error);
      Alert.alert('운동을 멈추지 못했어요', `${getExerciseApiErrorMessage(error)} 다시 눌러 주세요.`);
    } finally {
      stopping.current = false;
      setStopBusy(false);
    }
  };

  if (phase !== 'exercise' && phase !== 'rest') {
    return (
      <View style={styles.saving}>
        <Text style={styles.savingText}>{finishFailed ? '운동 결과를 저장하지 못했어요.' : '운동 결과를 저장하고 있어요.'}</Text>
        {finishFailed ? (
          <Pressable accessibilityRole="button" onPress={() => { setFinishFailed(false); void finish(); }} style={styles.retry}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <R6ExerciseSession
        exercise={currentExercise}
        onAddRest={addRestSeconds}
        onBack={openExitConfirmation}
        onCompleteSet={completeCurrentSet}
        onCycleSpeed={cycleCountSpeed}
        onReportDiscomfort={session.savedRoutine ? undefined : reportDiscomfort}
        onReportStop={(report) => recordSymptomStop(report).then(() => true, () => false)}
        onRetryStop={(report) => retrySymptomStop(report).then(() => true, () => false)}
        onSkip={openSkipConfirmation}
        onSkipRest={skipRest}
        onStopWorkout={leaveSession}
        onTogglePause={togglePause}
        session={session}
      />
      <ConfirmDialog
        description="현재 운동의 진행 내용은 저장되지 않아요. 다음 운동으로 이동할까요?"
        onPrimary={skipCurrentExercise}
        onSecondary={closeSkipConfirmation}
        primaryLabel="건너뛰기"
        secondaryLabel="취소"
        title="이 운동을 건너뛸까요?"
        visible={skipConfirmationVisible}
      />
      <ConfirmDialog
        description="지금 나가면 진행 중인 운동이 기록되지 않을 수 있어요."
        busy={stopBusy}
        onPrimary={() => void stopWorkout()}
        onSecondary={closeExitConfirmation}
        primaryLabel={stopBusy ? '멈추는 중…' : '운동 중단'}
        secondaryLabel="계속 하기"
        title="운동을 중단할까요?"
        visible={exitConfirmationVisible}
      />
    </>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    saving: { alignItems: 'center', backgroundColor: colors.background, flex: 1, gap: 12, justifyContent: 'center', padding: 20 },
    savingText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardRegular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
    retry: { ...aForm(colors).mini, height: 40, paddingHorizontal: 16 },
    retryText: aForm(colors).miniText,
  } as const;
}
