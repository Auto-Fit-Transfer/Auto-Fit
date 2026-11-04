import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import ClockIcon from '@/assets/icons/ui/clock.svg';
import FireIcon from '@/assets/icons/ui/fire.svg';
import HeartbeatIcon from '@/assets/icons/ui/heartbeat.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { exerciseEquipmentLabels, exerciseIntensityLabels, exerciseLocationLabels } from '@/src/features/exercise/exerciseData';
import { fontFamilies } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

export default function ExerciseSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { condition, homeLoadState, refreshHome, routine, selectPlanSession, startRoutine } =
    useExerciseRoutine();
  const { beginSession } = useExerciseSession();
  const [isStarting, setIsStarting] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
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

  const selectedPlan = routine?.planSessions.find(
    (plan) => plan.id === routine.selectedPlanSessionId,
  );
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const canStart =
    Boolean(routine) &&
    (!selectedPlan ||
      (selectedPlan.scheduledDate <= today &&
        !['completed', 'skipped'].includes(selectedPlan.status)));

  const handleStart = async () => {
    if (!routine || !canStart || isStarting) return;
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
  const summary: [typeof ClockIcon, string][] = [];
  if (duration !== null) summary.push([ClockIcon, `${duration}분`]);
  if (routine?.estimatedCalories != null) summary.push([FireIcon, `약 ${routine.estimatedCalories}kcal`]);
  if (routine?.intensity) summary.push([HeartbeatIcon, `강도 ${exerciseIntensityLabels[routine.intensity] ?? routine.intensity}`]);
  const conditions = [
    condition.availableMinutes === null ? null : `${condition.availableMinutes}분`,
    condition.location ? exerciseLocationLabels[condition.location] : null,
    condition.location
      ? condition.equipment.length
        ? condition.equipment.map((item) => exerciseEquipmentLabels[item]).join(', ')
        : '기구 없음'
      : null,
    condition.condition ? `컨디션 ${condition.condition}` : null,
  ].filter((value): value is string => Boolean(value));
  const reasons = routine?.reasons.length
    ? routine.reasons
    : ['오늘 입력한 운동 시간과 장소, 컨디션을 바탕으로 추천했어요.'];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScreenHeader onBack={goBack} title={routine?.planSessions.length ? '요일별 운동 계획' : '오늘의 맞춤 운동'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {routine ? (
          <>
            <Text style={styles.sourceLabel}>
              {routine.generator === 'auto-fit-ai' ? 'AI 모델 추천' : '기본 운동 추천'}
            </Text>
            <Text style={styles.heading}>{routine.title}</Text>
            {routine.subtitle ? <Text style={styles.subtitle}>{routine.subtitle}</Text> : null}
            <View style={styles.metaRow}>
              {summary.map(([Icon, label]) => (
                <View key={label} style={styles.metaItem}>
                  <Icon color="#3B3A42" height={18} width={18} />
                  <Text style={styles.meta}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.conditionBar}>
              <Text numberOfLines={2} style={styles.conditionText}>
                {conditions.join(' · ')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/exercise/condition', params: { source: 'summary' } })
                }
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonText}>바꾸기</Text>
              </Pressable>
            </View>
            <View style={styles.reasonCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: reasonsOpen }}
                onPress={() => setReasonsOpen((value) => !value)}
                style={styles.reasonHeading}
              >
                <View style={styles.grow}>
                  <Text style={styles.rowTitle}>이렇게 골랐어요</Text>
                  {reasonsOpen ? null : <Text numberOfLines={1} style={styles.reasonLine}>{reasons[0]}</Text>}
                </View>
                {reasonsOpen ? <MinusIcon color="#17161D" height={22} width={22} /> : <PlusIcon color="#17161D" height={22} width={22} />}
              </Pressable>
              {reasonsOpen ? reasons.map((reason, index) => (
                <View key={index} style={styles.reasonRow}>
                  <CheckIcon color="#17161D" height={18} width={18} />
                  <Text style={styles.reason}>{reason}</Text>
                </View>
              )) : null}
            </View>
            {routine.planSessions.length > 0 ? (
              <View style={styles.planSection}>
                <Text style={styles.sectionTitle}>이번 추천의 운동 일정</Text>
                <Text style={styles.planHint}>날짜를 눌러 운동을 확인하세요. 예정일이 되면 시작할 수 있어요.</Text>
                {routine.planSessions.map((plan) => {
                  const selected = plan.id === routine.selectedPlanSessionId;
                  const dateLabel = new Date(`${plan.scheduledDate}T12:00:00`).toLocaleDateString(
                    'ko-KR',
                    { month: 'long', day: 'numeric', weekday: 'long' },
                  );
                  return (
                    <Pressable
                      key={plan.id}
                      accessibilityLabel={`${dateLabel} ${plan.name}, ${plan.exercises.length}개 운동`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectPlanSession(plan.id)}
                      style={[styles.planRow, selected && styles.planRowSelected]}
                    >
                      <View style={styles.grow}>
                        <Text style={styles.planDate}>{dateLabel}</Text>
                        <Text style={styles.rowTitle}>{plan.name}</Text>
                        <Text style={styles.planMeta}>{plan.durationMinutes}분 · {plan.exercises.length}개 운동</Text>
                      </View>
                      <Text style={styles.planStatus}>
                        {plan.status === 'completed'
                          ? '완료'
                          : plan.status === 'in_progress'
                            ? '진행 중'
                            : plan.scheduledDate > today
                              ? '예정'
                              : '시작 가능'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>{selectedPlan ? `${selectedPlan.name} · ` : ''}운동 {routine.exercises.length}개</Text>
            <View style={styles.list}>
              {routine.exercises.map((exercise, index) => (
                <View key={exercise.id} style={[styles.exerciseRow, index > 0 && styles.rowDivider]}>
                  <View style={styles.exerciseIcon}>
                    <BarbellIcon color="#17161D" height={22} width={22} />
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.rowTitle}>{exercise.name}</Text>
                    <Text style={styles.prescription}>
                      {exercise.prescription || '자세한 운동 방법은 시작 후 확인해 주세요.'}
                    </Text>
                  </View>
                  {exercise.name.includes('스쿼트') ? (
                    <Pressable
                      accessibilityLabel="스쿼트 자세 10초 촬영"
                      accessibilityRole="button"
                      onPress={() => router.push('/exercise/posture-capture' as Href)}
                      style={styles.smallButton}
                    >
                      <Text style={styles.smallButtonText}>자세 촬영</Text>
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
              style={styles.smallButton}
            >
              <Text style={styles.smallButtonText}>운동 설정하기</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isStarting, disabled: !canStart || isStarting }}
          disabled={!canStart || isStarting}
          onPress={() => void handleStart()}
          style={[styles.startButton, (!canStart || isStarting) && styles.disabled]}
        >
          <Text style={styles.startText}>
            {isStarting
              ? '운동 시작하는 중…'
              : selectedPlan?.status === 'completed'
                ? '완료한 운동'
                : selectedPlan && selectedPlan.scheduledDate > today
                  ? '예정된 운동'
                  : '운동 시작하기'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', backgroundColor: '#FFFFFF', flex: 1, maxWidth: 412, width: '100%' },
  content: { gap: 12, paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  grow: { flex: 1, minWidth: 0 },
  heading: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30 },
  subtitle: { color: '#3B3A42', fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  meta: { color: '#3B3A42', fontSize: 14, lineHeight: 21 },
  conditionBar: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 4, minHeight: 56, paddingHorizontal: 14 },
  conditionText: { color: '#3B3A42', flex: 1, fontSize: 14, lineHeight: 21 },
  smallButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#FFFFFF', borderColor: '#DFE2E7', borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
  smallButtonText: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  reasonCard: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  reasonHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  rowTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  reasonLine: { color: '#5E5D66', fontSize: 12, lineHeight: 18 },
  reasonRow: { flexDirection: 'row', gap: 8 },
  reason: { color: '#3B3A42', flex: 1, fontSize: 14, lineHeight: 21 },
  sectionTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26, marginTop: 8 },
  list: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  exerciseRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 80, paddingHorizontal: 16, paddingVertical: 10 },
  rowDivider: { borderTopColor: '#DFE2E7', borderTopWidth: 1 },
  exerciseIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DFE2E7', borderRadius: 12, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  prescription: { color: '#5E5D66', fontSize: 14, lineHeight: 21 },
  empty: { alignItems: 'flex-start', gap: 10, paddingTop: 40 },
  footer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 8 },
  startButton: { alignItems: 'center', backgroundColor: '#5246C6', borderRadius: 12, height: 56, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  startText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  sourceLabel: { color: '#5E5D66', fontFamily: fontFamilies.pretendardMedium, fontSize: 12, lineHeight: 18 },
  planSection: { gap: 8 },
  planHint: { color: '#5E5D66', fontSize: 12, lineHeight: 18 },
  planRow: { alignItems: 'center', backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 80, paddingHorizontal: 16, paddingVertical: 10 },
  planRowSelected: { backgroundColor: '#FFFFFF', borderColor: '#5246C6', borderWidth: 2 },
  planDate: { color: '#5E5D66', fontSize: 12, lineHeight: 18 },
  planMeta: { color: '#5E5D66', fontSize: 14, lineHeight: 21 },
  planStatus: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
});
