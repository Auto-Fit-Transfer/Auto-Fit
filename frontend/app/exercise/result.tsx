import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, BackHandler, Platform, View } from 'react-native';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { getExerciseApiErrorMessage, saveExerciseSessionFeedback } from '@/src/api/exercise';
import { AppButton, Notice, Text } from '@/src/components/common';
import { ChoiceChips, ChoiceSection } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import {
  createInitialExerciseResultRecord,
  exerciseDiscomfortAreas,
  exercisePostStates,
  type ExerciseDifficulty,
  type ExerciseDiscomfortArea,
} from '@/src/features/exercise/exerciseResultMocks';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const postConditionValues = {
  'very-good': 'very_good',
  good: 'good',
  neutral: 'normal',
  tired: 'bad',
  'very-tired': 'very_bad',
} as const;

// The server keeps a 1~5 scale; each step gets words.
const difficultyOptions: { value: ExerciseDifficulty; label: string }[] = [
  { value: 1, label: '아주 쉬웠어요' },
  { value: 2, label: '쉬웠어요' },
  { value: 3, label: '적당했어요' },
  { value: 4, label: '힘들었어요' },
  { value: 5, label: '아주 힘들었어요' },
];
// Best to worst, the way the other choices read.
const postStateOptions = [...exercisePostStates]
  .reverse()
  .map(({ key, label }) => ({ value: key, label }));
const discomfortOptions = exerciseDiscomfortAreas.map(({ key, label }) => ({ value: key, label }));

// Figma E6. Values the session did not save show "-" instead of sample numbers.
export default function ExerciseResultScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { latestSession, markResultRecordCompleted } = useExerciseRoutine();
  const { clearSession } = useExerciseSession();
  const [record, setRecord] = useState(createInitialExerciseResultRecord);
  const [isSaving, setIsSaving] = useState(false);

  const stats = [
    {
      label: '운동 시간',
      value: latestSession?.durationMinutes != null ? `${latestSession.durationMinutes}분` : '-',
    },
    {
      label: '운동 개수',
      value: latestSession?.itemCount != null ? `${latestSession.itemCount}개` : '-',
    },
    {
      label: '소모 칼로리',
      value: latestSession?.calories != null ? `${latestSession.calories}kcal` : '-',
    },
  ];

  const handleBack = useCallback(() => {
    if (source === 'completion') {
      router.back();
      return;
    }
    router.dismissTo('/exercise');
  }, [router, source]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const toggleDiscomfortArea = (area: ExerciseDiscomfortArea) => {
    setRecord((current) => {
      if (area === 'none') return { ...current, discomfortAreas: ['none'] };

      const selectedAreas = current.discomfortAreas.filter((selected) => selected !== 'none');
      const isSelected = selectedAreas.includes(area);
      const nextAreas = isSelected
        ? selectedAreas.filter((selected) => selected !== area)
        : [...selectedAreas, area];
      return { ...current, discomfortAreas: nextAreas.length ? nextAreas : ['none'] };
    });
  };

  const saveRecord = async () => {
    if (isSaving) return;
    const sessionId = latestSession?.sessionId;
    if (!sessionId) {
      Alert.alert('기록을 저장하지 못했어요', '마친 운동 정보를 찾지 못했어요.');
      return;
    }

    setIsSaving(true);
    try {
      await saveExerciseSessionFeedback(sessionId, {
        note: null,
        perceivedDifficulty: record.difficulty,
        postCondition: postConditionValues[record.postState],
        uncomfortableAreas: record.discomfortAreas.filter((area) => area !== 'none'),
      });
      markResultRecordCompleted();
      clearSession();
      requestAnimationFrame(() =>
        router.replace({
          pathname: '/exercise/ai-report',
          params: {
            resultSource: source === 'completion' ? 'completion' : 'home',
            source: 'record',
          },
        }),
      );
    } catch (error) {
      console.error('Exercise feedback save failed:', error);
      Alert.alert('기록을 저장하지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SubScreen
      footer={<AppButton loading={isSaving} onPress={() => void saveRecord()} title="완료" />}
      gap={28}
      onBack={handleBack}
    >
      <View style={styles.heading}>
        <View style={styles.checkCircle}>
          <CheckIcon color={colors.success} height={30} width={30} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          오늘 운동을 마쳤어요
        </Text>
        <Text style={styles.description}>어땠는지 남겨 주시면 다음 루틴에 반영해요.</Text>
      </View>

      <View style={styles.stats}>
        {stats.map((stat, index) => (
          <View key={stat.label} style={[styles.stat, index > 0 && styles.statDivider]}>
            <Text style={styles.caption}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <ChoiceSection title="오늘 강도는 어땠나요?">
        <ChoiceChips
          isSelected={(value) => record.difficulty === value}
          onSelect={(value) => setRecord((current) => ({ ...current, difficulty: value }))}
          options={difficultyOptions}
        />
      </ChoiceSection>
      <ChoiceSection title="운동 뒤 몸 상태는요?">
        <ChoiceChips
          isSelected={(value) => record.postState === value}
          onSelect={(value) => setRecord((current) => ({ ...current, postState: value }))}
          options={postStateOptions}
        />
      </ChoiceSection>
      <ChoiceSection aside="여러 개 고를 수 있어요" title="불편했던 곳이 있었나요?">
        <ChoiceChips
          isSelected={(value) => record.discomfortAreas.includes(value)}
          onSelect={toggleDiscomfortArea}
          options={discomfortOptions}
        />
      </ChoiceSection>
      <Notice body="통증이나 불편함이 계속되면 전문가와 상담해 주세요." tone="warning" />
    </SubScreen>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    heading: { gap: 8, paddingTop: 8 },
    checkCircle: {
      alignItems: 'center',
      backgroundColor: colors.successLight,
      borderRadius: 28,
      height: 56,
      justifyContent: 'center',
      marginBottom: 12,
      width: 56,
    },
    title: { ...text.title1, color: colors.textPrimary },
    description: { ...text.body1, color: colors.textSecondary },
    caption: { ...text.caption, color: colors.textSecondary },
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
  } as const;
}
