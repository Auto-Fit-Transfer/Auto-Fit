import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/src/api/client';
import { getExerciseApiErrorMessage, getExerciseSessionAnalysis } from '@/src/api/exercise';
import { aForm } from '@/src/components/a/form';
import { ALoading } from '@/src/components/a/ALoading';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { mapExerciseAnalysis } from '@/src/features/exercise/exerciseAnalysis';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

export default function ExerciseAiReportScreen() {
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const returnHome = () => router.dismissTo('/exercise');

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void getExerciseSessionAnalysis(sessionId)
      .then(({ analysis }) => {
        if (active) setResult({ key: requestKey, report: mapExerciseAnalysis(analysis), error: null });
      })
      .catch((reason: unknown) => {
        // The workout is already saved when this screen opens; only the AI part failed.
        const error = reason instanceof ApiError && reason.status >= 500
          ? '운동 기록은 저장됐어요. AI 분석을 지금 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
          : getExerciseApiErrorMessage(reason);
        if (active) setResult({ key: requestKey, report: null, error });
      });
    return () => {
      active = false;
    };
  }, [sessionId, requestKey]);

  useEffect(() => {
    if (resultRecordCompleted) return undefined;
    const frame = requestAnimationFrame(() => router.replace('/exercise/completion'));
    return () => cancelAnimationFrame(frame);
  }, [resultRecordCompleted, router]);

  if (!resultRecordCompleted) return null;

  return (
    <View style={s.root}>
      <ScreenHeader onBack={returnHome} title="운동 결과" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        {!report ? (
          error ? (
            <View style={[s.card, s.state]}>
              <Text accessibilityRole="alert" style={s.body}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={({ pressed }) => [s.mini, pressed && s.miniPressed]}>
                <Text style={s.miniText}>다시 시도</Text>
              </Pressable>
            </View>
          ) : <View style={s.wait}><ALoading /></View>
        ) : (
          <>
            <View style={[s.card, s.grid]}>
              {report.metrics.map(({ label, value }, index) => (
                <View key={label} style={[s.metric, index % 2 === 1 && s.metricLine, index > 1 && s.metricTop]}>
                  <Text style={s.metricLabel}>{label}</Text>
                  <Text numberOfLines={1} style={s.metricValue}>{value}</Text>
                </View>
              ))}
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>{report.insight.title}</Text>
              <Text style={s.body}>{report.insight.description}</Text>
            </View>
            {report.nextWorkout.length > 0 ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>다음 운동에 반영해요</Text>
                {report.nextWorkout.map(({ title }) => (
                  <Text key={title} style={s.body}>· {title}</Text>
                ))}
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={returnHome} style={({ pressed }) => [s.primary, pressed && s.primaryPressed]}>
              <Text style={s.primaryText}>완료</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createSStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
    card: { ...a.card, gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
    state: { alignItems: 'center', gap: 14 },
    wait: { height: 420 },
    // four answers in two rows of two, split by the track line
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, paddingHorizontal: 0, paddingVertical: 0 },
    metric: { gap: 4, paddingHorizontal: 14, paddingVertical: 14, width: '50%' },
    metricLine: { borderLeftColor: colors.track, borderLeftWidth: 2 },
    metricTop: { borderTopColor: colors.track, borderTopWidth: 2 },
    metricLabel: a.note,
    metricValue: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    cardTitle: { ...a.p15, color: colors.ink },
    body: { ...a.p15, color: colors.ink },
    mini: a.mini,
    miniPressed: { boxShadow: `0 0 0 ${colors.ink}`, transform: [{ translateY: 3 }] },
    miniText: a.miniText,
    primary: { ...a.go, height: 52, marginTop: 4 },
    primaryPressed: a.goPressed,
    primaryText: a.goText,
  } as const;
}
