import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getExerciseApiErrorMessage, recordExerciseDiscomfort } from '@/src/api/exercise';
import { Text } from '@/src/components/common';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { R6ExerciseSession, type DiscomfortReport } from '@/src/components/exercise/R6ExerciseSession';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { loadVoiceGuideSettings, speakGuide } from '@/src/features/exercise/voiceGuide';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

export default function ExerciseSessionScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { markRoutineCompleted, resultRecordCompleted } = useExerciseRoutine();
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
        console.error('Exercise adjustment failed:', error);
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
      markRoutineCompleted({
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
      console.error('Exercise session completion failed:', error);
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

  const leaveSession = () => {
    clearSession();
    requestAnimationFrame(() => router.dismissTo('/exercise/summary'));
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
        onReportDiscomfort={reportDiscomfort}
        onSkip={openSkipConfirmation}
        onSkipRest={skipRest}
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
        onPrimary={leaveSession}
        onSecondary={closeExitConfirmation}
        primaryLabel="운동 중단"
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
    savingText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 16, textAlign: 'center' },
    retry: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
    retryText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  } as const;
}
