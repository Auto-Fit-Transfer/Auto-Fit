import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { getExerciseApiErrorMessage, getExerciseSessionAnalysis } from '@/src/api/exercise';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { mapExerciseAnalysis } from '@/src/features/exercise/exerciseAnalysis';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { fontFamilies } from '@/src/theme';

export default function ExerciseAiReportScreen() {
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
        if (active) setResult({ key: requestKey, report: null, error: getExerciseApiErrorMessage(reason) });
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
      <StatusBar style="dark" />
      <ScreenHeader onBack={returnHome} title="운동 결과" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        {!report ? (
          <View style={[s.card, s.state]}>
            {error ? (
              <>
                <Text accessibilityRole="alert" style={s.body}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={s.smallButton}>
                  <Text style={s.smallButtonText}>다시 시도</Text>
                </Pressable>
              </>
            ) : <ActivityIndicator color="#5246C6" />}
          </View>
        ) : (
          <>
            <View style={s.grid}>
              {report.metrics.map(({ label, value }) => (
                <View key={label} style={s.metric}>
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
                  <View key={title} style={s.nextRow}>
                    <CheckIcon color="#17161D" height={18} width={18} />
                    <Text style={[s.body, s.grow]}>{title}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={returnHome} style={s.primary}>
              <Text style={s.primaryText}>완료</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  content: { gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  grow: { flex: 1 },
  card: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, gap: 8, padding: 18 },
  state: { alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, flexBasis: '48%', flexGrow: 1, gap: 2, padding: 14 },
  metricLabel: { color: '#5E5D66', fontSize: 14, lineHeight: 21 },
  metricValue: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  cardTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  body: { color: '#3B3A42', fontSize: 14, lineHeight: 21 },
  nextRow: { flexDirection: 'row', gap: 8 },
  smallButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DFE2E7', borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
  smallButtonText: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  primary: { alignItems: 'center', backgroundColor: '#5246C6', borderRadius: 12, height: 56, justifyContent: 'center', marginTop: 8 },
  primaryText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
});
