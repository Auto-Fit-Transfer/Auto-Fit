import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Alert, BackHandler, Platform, View } from 'react-native';

import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import ClockIcon from '@/assets/icons/ui/clock.svg';
import FireIcon from '@/assets/icons/ui/fire.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { AppButton, IconButton, Text } from '@/src/components/common';
import { SurfaceCard } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import {
  exerciseEquipmentLabels,
  exerciseLocationLabels,
} from '@/src/features/exercise/exerciseData';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Figma E2. Moving exercises by their handles waits for the server to keep the order.
export default function ExerciseSummaryScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { condition, refreshHome, routine, startRoutine } = useExerciseRoutine();
  const { beginSession } = useExerciseSession();
  const [isStarting, setIsStarting] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);

  useEffect(() => {
    if (routine) return undefined;
    const frame = requestAnimationFrame(() => {
      void refreshHome();
    });
    return () => cancelAnimationFrame(frame);
  }, [refreshHome, routine]);

  const backToExerciseHome = useCallback(() => router.dismissTo('/exercise'), [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      backToExerciseHome();
      return true;
    });

    return () => subscription.remove();
  }, [backToExerciseHome]);

  const handleStartWorkout = async () => {
    if (!routine || isStarting) return;
    setIsStarting(true);
    try {
      const startedSession = await startRoutine();
      beginSession(routine, startedSession);
      requestAnimationFrame(() => router.push('/exercise/session' as Href));
    } catch (error) {
      console.error('Exercise session start failed:', error);
      Alert.alert('운동을 시작하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const minutes = routine?.totalDurationMinutes ?? condition.availableMinutes;
  const conditionLine = [
    condition.availableMinutes !== null ? `${condition.availableMinutes}분` : null,
    condition.location ? exerciseLocationLabels[condition.location] : null,
    condition.equipment.length
      ? condition.equipment.map((item) => exerciseEquipmentLabels[item]).join(', ')
      : null,
    condition.condition ? `컨디션 ${condition.condition}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SubScreen
      footer={
        <AppButton
          disabled={!routine || routine.exercises.length === 0}
          loading={isStarting}
          onPress={() => void handleStartWorkout()}
          title="운동 시작하기"
        />
      }
      gap={16}
      onBack={backToExerciseHome}
      title="오늘의 맞춤 운동"
    >
      {routine ? (
        <>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {routine.title}
            </Text>
            {routine.subtitle ? <Text style={styles.subtitle}>{routine.subtitle}</Text> : null}
            <View style={styles.meta}>
              {minutes !== null ? (
                <MetaItem icon={<ClockIcon color={colors.textSecondary} height={16} width={16} />}>
                  {minutes}분
                </MetaItem>
              ) : null}
              {routine.estimatedCalories !== null ? (
                <MetaItem icon={<FireIcon color={colors.textSecondary} height={16} width={16} />}>
                  약 {routine.estimatedCalories}kcal
                </MetaItem>
              ) : null}
              {routine.intensity ? <MetaItem>강도 {routine.intensity}</MetaItem> : null}
            </View>
          </View>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>
              {conditionLine || '조건을 아직 고르지 않았어요'}
            </Text>
            <AppButton
              fullWidth={false}
              onPress={() =>
                router.push({ pathname: '/exercise/condition', params: { source: 'summary' } })
              }
              size="S"
              title="바꾸기"
              variant="outline"
            />
          </View>

          {routine.reasons.length > 0 ? (
            <SurfaceCard>
              <View style={styles.reasonHeader}>
                <View style={styles.flex}>
                  <Text style={styles.strong}>이렇게 골랐어요</Text>
                  {!reasonsOpen ? (
                    <Text numberOfLines={1} style={styles.caption}>
                      {routine.reasons.join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <IconButton
                  accessibilityLabel={reasonsOpen ? '이유 접기' : '이유 펼치기'}
                  icon={
                    reasonsOpen ? (
                      <MinusIcon color={colors.textPrimary} height={20} width={20} />
                    ) : (
                      <PlusIcon color={colors.textPrimary} height={20} width={20} />
                    )
                  }
                  onPress={() => setReasonsOpen((open) => !open)}
                  size={40}
                  surface
                />
              </View>
              {reasonsOpen
                ? routine.reasons.map((reason) => (
                    <Text key={reason} style={styles.body}>
                      · {reason}
                    </Text>
                  ))
                : null}
            </SurfaceCard>
          ) : null}

          <Text style={styles.sectionTitle}>운동 {routine.exercises.length}개</Text>
          <View style={styles.list}>
            {routine.exercises.map((exercise, index) => (
              <View key={exercise.id} style={[styles.row, index > 0 && styles.divider]}>
                <View style={styles.iconBox}>
                  <BarbellIcon color={colors.textPrimary} height={20} width={20} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.strong}>{exercise.name}</Text>
                  {exercise.prescription ? (
                    <Text style={styles.caption}>{exercise.prescription}</Text>
                  ) : null}
                </View>
              </View>
            ))}
            {routine.exercises.length === 0 ? (
              <Text style={[styles.caption, styles.emptyList]}>표시할 운동이 없어요.</Text>
            ) : null}
          </View>
        </>
      ) : (
        <SurfaceCard gap={16}>
          <Text style={styles.strong}>추천 운동을 불러오지 못했어요</Text>
          <Text style={styles.caption}>조건을 다시 고르면 새로 만들어 드려요.</Text>
          <AppButton
            fullWidth={false}
            onPress={() =>
              router.push({ pathname: '/exercise/condition', params: { source: 'summary' } })
            }
            size="M"
            title="조건 다시 고르기"
            variant="outline"
          />
        </SurfaceCard>
      )}
    </SubScreen>
  );
}

function MetaItem({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.metaItem}>
      {icon}
      <Text style={styles.caption}>{children}</Text>
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1, gap: 2 },
    heading: { gap: 6, paddingTop: 4 },
    title: { ...text.title1, color: colors.textPrimary },
    subtitle: { ...text.body2, color: colors.textSecondary },
    meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metaItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    caption: { ...text.caption, color: colors.textSecondary },
    body: { ...text.body2, color: colors.textBody },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    sectionTitle: { ...text.body1Strong, color: colors.textPrimary, marginTop: 8 },
    conditionRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      paddingLeft: 16,
      paddingRight: 12,
      paddingVertical: 10,
    },
    conditionText: { ...text.body2, color: colors.textBody, flex: 1 },
    reasonHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    list: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 14 },
    divider: { borderTopColor: colors.border, borderTopWidth: 1 },
    iconBox: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    emptyList: { paddingVertical: 16 },
  } as const;
}
