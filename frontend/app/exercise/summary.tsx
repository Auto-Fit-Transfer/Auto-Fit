import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { exerciseLocationLabels } from '@/src/features/exercise/exerciseData';
import { fontFamilies } from '@/src/theme';

export default function ExerciseSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { condition, homeLoadState, refreshHome, routine, startRoutine } = useExerciseRoutine();
  const { beginSession } = useExerciseSession();
  const [isStarting, setIsStarting] = useState(false);
  const goBack = useCallback(() => router.dismissTo('/exercise'), [router]);

  useEffect(() => {
    if (routine) return undefined;
    const frame = requestAnimationFrame(() => {
      void refreshHome();
    });
    return () => cancelAnimationFrame(frame);
  }, [refreshHome, routine]);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  const handleStart = async () => {
    if (!routine || isStarting) return;
    setIsStarting(true);
    try {
      const started = await startRoutine();
      beginSession(routine, started);
      router.push('/exercise/session' as Href);
    } catch (error) {
      Alert.alert('운동을 시작하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const duration = routine?.totalDurationMinutes ?? condition.availableMinutes;
  const summary = [
    duration === null ? null : String(duration) + '분',
    routine?.estimatedCalories === null || routine?.estimatedCalories === undefined
      ? null
      : '약 ' + String(routine.estimatedCalories) + 'kcal',
    routine?.intensity ? '강도 ' + routine.intensity : null,
  ].filter((value): value is string => Boolean(value));
  const conditions = [
    condition.availableMinutes === null ? null : String(condition.availableMinutes) + '분',
    condition.location ? exerciseLocationLabels[condition.location] : null,
    condition.equipment.length ? condition.equipment.length + '종 기구' : '기구 없음',
    condition.condition,
  ].filter((value): value is string => Boolean(value));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 5 }]}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.back}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 맞춤 운동</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {routine ? (
          <>
            <Text style={styles.heading}>{routine.title}</Text>
            {routine.subtitle ? <Text style={styles.subtitle}>{routine.subtitle}</Text> : null}
            <Text style={styles.meta}>{summary.join('  ·  ')}</Text>
            <View style={styles.conditionBar}>
              <Text numberOfLines={2} style={styles.conditionText}>
                {conditions.join(' · ')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/exercise/condition', params: { source: 'summary' } })
                }
                style={styles.change}
              >
                <Text style={styles.changeText}>바꾸기</Text>
              </Pressable>
            </View>
            <View style={styles.reasonCard}>
              <Text style={styles.reasonTitle}>이렇게 골랐어요</Text>
              {routine.reasons.length ? (
                routine.reasons.map((reason, index) => (
                  <Text key={index} style={styles.reason}>
                    • {reason}
                  </Text>
                ))
              ) : (
                <Text style={styles.reason}>
                  오늘 입력한 운동 시간과 장소, 컨디션을 바탕으로 추천했어요.
                </Text>
              )}
            </View>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>운동 {routine.exercises.length}개</Text>
            </View>
            <View style={styles.list}>
              {routine.exercises.map((exercise, index) => (
                <View
                  key={exercise.id}
                  style={[
                    styles.exerciseRow,
                    index === routine.exercises.length - 1 && styles.lastRow,
                  ]}
                >
                  <View style={styles.exerciseIcon}>
                    <Text style={styles.exerciseIconText}>◉</Text>
                  </View>
                  <View style={styles.exerciseCopy}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.exercisePrescription}>
                      {exercise.prescription || '자세한 운동 방법은 시작 후 확인해 주세요.'}
                    </Text>
                  </View>
                  {exercise.name.includes('스쿼트') ? (
                    <Pressable
                      accessibilityLabel="스쿼트 자세 10초 촬영"
                      accessibilityRole="button"
                      onPress={() => router.push('/exercise/posture-capture' as Href)}
                      style={styles.postureButton}
                    >
                      <Text style={styles.postureButtonText}>자세 촬영</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.heading}>
              {homeLoadState === 'loading'
                ? '추천 운동을 불러오고 있어요'
                : '아직 추천 운동이 없어요'}
            </Text>
            <Text style={styles.subtitle}>
              잠시 후에도 보이지 않으면 운동 설정부터 다시 진행해 주세요.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/exercise/condition')}
              style={styles.emptyAction}
            >
              <Text style={styles.emptyActionText}>운동 설정하기</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isStarting, disabled: !routine || isStarting }}
          disabled={!routine || isStarting}
          onPress={() => void handleStart()}
          style={[styles.startButton, (!routine || isStarting) && styles.disabled]}
        >
          <Text style={styles.startText}>{isStarting ? '운동 시작하는 중…' : '운동 시작하기'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', backgroundColor: '#FFFFFF', flex: 1, maxWidth: 412, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 19 },
  back: { height: 44, justifyContent: 'center', width: 38 },
  backText: { color: '#222227', fontSize: 31, lineHeight: 36 },
  headerTitle: {
    color: '#222227',
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  headerSpacer: { width: 38 },
  content: { paddingBottom: 25, paddingHorizontal: 20, paddingTop: 27 },
  heading: {
    color: '#222227',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 23,
    lineHeight: 30,
  },
  subtitle: { color: '#777780', fontSize: 12, marginTop: 5 },
  meta: { color: '#777780', fontSize: 12, marginTop: 10 },
  conditionBar: {
    alignItems: 'center',
    backgroundColor: '#FAFAFB',
    borderColor: '#E7E7EC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 22,
    minHeight: 48,
    paddingHorizontal: 11,
  },
  conditionText: { color: '#66666F', flex: 1, fontSize: 11, lineHeight: 16 },
  change: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E7EC',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  changeText: { color: '#55555D', fontSize: 11 },
  reasonCard: {
    backgroundColor: '#FAFAFB',
    borderColor: '#E7E7EC',
    borderRadius: 9,
    borderWidth: 1,
    gap: 9,
    marginTop: 15,
    padding: 15,
  },
  reasonTitle: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  reason: { color: '#66666F', fontSize: 12, lineHeight: 18 },
  listHeader: { marginBottom: 10, marginTop: 23 },
  sectionTitle: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  list: { borderColor: '#E7E7EC', borderRadius: 9, borderWidth: 1, overflow: 'hidden' },
  exerciseRow: {
    alignItems: 'center',
    borderBottomColor: '#EEEEF1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 10,
  },
  lastRow: { borderBottomWidth: 0 },
  exerciseIcon: {
    alignItems: 'center',
    backgroundColor: '#F4F4F7',
    borderRadius: 7,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  exerciseIconText: { color: '#777780', fontSize: 17 },
  exerciseCopy: { flex: 1, gap: 4, marginLeft: 9 },
  exerciseName: { color: '#333339', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  exercisePrescription: { color: '#9999A1', fontSize: 11 },
  postureButton: {
    borderColor: '#E7E7EC',
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  postureButtonText: { color: '#503DD7', fontSize: 11, fontFamily: fontFamilies.pretendardSemiBold },
  empty: { gap: 10, paddingTop: 40 },
  emptyAction: {
    alignSelf: 'flex-start',
    borderColor: '#E7E7EC',
    borderRadius: 7,
    borderWidth: 1,
    marginTop: 9,
    padding: 9,
  },
  emptyActionText: { color: '#503DD7', fontSize: 12 },
  footer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10 },
  startButton: {
    alignItems: 'center',
    backgroundColor: '#503DD7',
    borderRadius: 8,
    height: 49,
    justifyContent: 'center',
  },
  disabled: { backgroundColor: '#DADAE1' },
  startText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
});
