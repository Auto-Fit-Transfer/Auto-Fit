import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { getExerciseApiErrorMessage, getExerciseSessionAnalysis } from '@/src/api/exercise';
import { AppButton, Text } from '@/src/components/common';
import { SurfaceCard } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { mapExerciseAnalysis } from '@/src/features/exercise/exerciseAnalysis';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Shown after the record is saved: what was done and what changes next time.
export default function ExerciseAiReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { resultSource, source } = useLocalSearchParams<{
    resultSource?: string;
    source?: string;
  }>();
  const { latestSession, resultRecordCompleted } = useExerciseRoutine();
  const [result, setResult] = useState<{
    key: string;
    report: ReturnType<typeof mapExerciseAnalysis> | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionId = latestSession?.sessionId;
  const requestKey = `${sessionId}:${attempt}`;
  const report = result?.key === requestKey ? result.report : null;
  const error = !sessionId
    ? '분석할 운동 기록이 없어요. 운동을 마친 뒤 다시 확인해 주세요.'
    : result?.key === requestKey
      ? result.error
      : null;

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void getExerciseSessionAnalysis(sessionId)
      .then(({ analysis }) => {
        if (active)
          setResult({ key: requestKey, report: mapExerciseAnalysis(analysis), error: null });
      })
      .catch((reason: unknown) => {
        if (active)
          setResult({ key: requestKey, report: null, error: getExerciseApiErrorMessage(reason) });
      });
    return () => {
      active = false;
    };
  }, [sessionId, requestKey]);

  const returnHome = useCallback(() => router.dismissTo('/exercise'), [router]);
  const handleBack = useCallback(() => {
    if (source === 'record') {
      router.replace({
        pathname: '/exercise/result',
        params: { source: resultSource === 'completion' ? 'completion' : 'home' },
      });
      return;
    }

    returnHome();
  }, [resultSource, returnHome, router, source]);

  useEffect(() => {
    if (resultRecordCompleted) return undefined;
    const frame = requestAnimationFrame(() =>
      router.replace({ pathname: '/exercise/result', params: { source: 'home' } }),
    );
    return () => cancelAnimationFrame(frame);
  }, [resultRecordCompleted, router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  if (!resultRecordCompleted) return null;

  return (
    <SubScreen
      footer={report ? <AppButton onPress={returnHome} title="완료" /> : undefined}
      gap={16}
      onBack={handleBack}
      title="운동 결과 분석"
    >
      {!report ? (
        <SurfaceCard gap={16}>
          {error ? null : <ActivityIndicator color={colors.textSecondary} />}
          <Text accessibilityRole="alert" style={styles.body}>
            {error ?? '운동 기록을 정리하고 있어요.'}
          </Text>
          {error && sessionId ? (
            <AppButton
              fullWidth={false}
              onPress={() => setAttempt((value) => value + 1)}
              size="M"
              title="다시 시도"
              variant="outline"
            />
          ) : null}
        </SurfaceCard>
      ) : (
        <>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              오늘 운동을 정리했어요
            </Text>
            <Text style={styles.description}>
              저장한 운동과 기록을 바탕으로 다음 운동 방향을 알려 드려요.
            </Text>
          </View>
          <View style={styles.metricGrid}>
            {report.metrics.map(({ label, value }) => (
              <View key={label} style={styles.metric}>
                <Text style={styles.caption}>{label}</Text>
                <Text numberOfLines={2} style={styles.metricValue}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
          <SurfaceCard gap={8}>
            <Text style={styles.caption}>인사이트</Text>
            <Text style={styles.strong}>{report.insight.title}</Text>
            {report.insight.description ? (
              <Text style={styles.body}>{report.insight.description}</Text>
            ) : null}
          </SurfaceCard>
          {report.nextWorkout.length > 0 ? (
            <SurfaceCard gap={10}>
              <Text style={styles.caption}>다음 운동에 반영</Text>
              {report.nextWorkout.map(({ title }) => (
                <View key={title} style={styles.nextRow}>
                  <CheckIcon color={colors.success} height={18} width={18} />
                  <Text style={[styles.body, styles.flex]}>{title}</Text>
                </View>
              ))}
            </SurfaceCard>
          ) : null}
        </>
      )}
    </SubScreen>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    heading: { gap: 8, paddingTop: 4 },
    title: { ...text.title1, color: colors.textPrimary },
    description: { ...text.body1, color: colors.textSecondary },
    caption: { ...text.caption, color: colors.textSecondary },
    body: { ...text.body2, color: colors.textBody },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexBasis: '47%',
      flexGrow: 1,
      gap: 4,
      padding: 14,
    },
    metricValue: { ...text.body1Strong, color: colors.textPrimary },
    nextRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  } as const;
}
