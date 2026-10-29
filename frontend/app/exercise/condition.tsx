import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, BackHandler, Platform } from 'react-native';

import HouseIcon from '@/assets/icons/ui/house.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { AppButton, AppTextField, IconButton, Notice } from '@/src/components/common';
import { ChoiceChips, ChoiceSection } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import {
  exerciseEquipmentLabels,
  exerciseLocationLabels,
  initialExerciseCondition,
  type ExerciseCondition,
  type ExerciseEquipment,
  type ExerciseLocation,
} from '@/src/features/exercise/exerciseData';
import { useAppTheme } from '@/src/theme';

const timeOptions = [30, 45, 60, 90, 120].map((minutes) => ({
  value: minutes,
  label: minutes === 120 ? '120분 이상' : `${minutes}분`,
}));
const locationOptions = (['gym', 'home', 'outdoor', 'other'] as ExerciseLocation[]).map((id) => ({
  value: id,
  label: exerciseLocationLabels[id],
}));
// Figma order: 맨몸 · 밴드 · 덤벨 · 머신 · 기타.
const equipmentOptions = (
  ['bodyweight', 'band', 'dumbbell', 'machine', 'other'] as ExerciseEquipment[]
).map((id) => ({ value: id, label: exerciseEquipmentLabels[id] }));
// The server takes the condition as words, so the chosen label is sent as is.
const conditionOptions = ['좋음', '보통', '피곤해요', '안 좋아요'].map((label) => ({
  value: label,
  label,
}));

function cloneExerciseCondition(condition: ExerciseCondition): ExerciseCondition {
  return {
    ...condition,
    equipment: [...condition.equipment],
  };
}

// Figma E1.
export default function ExerciseConditionScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { source: sourceParam } = useLocalSearchParams<{ source?: string | string[] }>();
  const { condition: savedCondition, generateRoutine } = useExerciseRoutine();
  const source = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;
  const isConditionReset = source === 'summary';
  const [condition, setCondition] = useState(() =>
    cloneExerciseCondition(isConditionReset ? savedCondition : initialExerciseCondition),
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const handleBack = useCallback(() => {
    if (isConditionReset) router.back();
    else router.replace('/exercise');
  }, [isConditionReset, router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    return () => subscription.remove();
  }, [handleBack]);

  const toggleEquipment = (id: ExerciseEquipment) =>
    setCondition((current) => ({
      ...current,
      equipment: current.equipment.includes(id)
        ? current.equipment.filter((item) => item !== id)
        : [...current.equipment, id],
    }));

  const handleGenerate = async () => {
    if (isGenerating) return;
    const conditionLevel = condition.condition.trim();
    if (condition.availableMinutes === null) {
      Alert.alert('운동할 수 있는 시간을 골라 주세요.');
      return;
    }
    if (condition.location === null) {
      Alert.alert('어디서 운동하는지 골라 주세요.');
      return;
    }
    if (!conditionLevel) {
      Alert.alert('오늘 컨디션을 골라 주세요.');
      return;
    }

    setIsGenerating(true);
    try {
      await generateRoutine({ ...condition, condition: conditionLevel });
      requestAnimationFrame(() => {
        if (isConditionReset) router.dismissTo('/exercise/summary');
        else router.push('/exercise/summary');
      });
    } catch (error) {
      console.error('Exercise recommendation generation failed:', error);
      Alert.alert('맞춤 운동을 만들지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SubScreen
      footer={
        <AppButton
          loading={isGenerating}
          onPress={() => void handleGenerate()}
          title="맞춤 운동 만들기"
        />
      }
      gap={28}
      onBack={handleBack}
      right={
        <IconButton
          accessibilityLabel="홈으로"
          icon={<HouseIcon color={colors.textPrimary} height={24} width={24} />}
          onPress={() => router.dismissTo('/home')}
          size={44}
        />
      }
      title="오늘의 운동 설정"
    >
      <ChoiceSection title="운동할 수 있는 시간">
        <ChoiceChips
          isSelected={(value) => condition.availableMinutes === value}
          onSelect={(value) => setCondition({ ...condition, availableMinutes: value })}
          options={timeOptions}
        />
      </ChoiceSection>
      <ChoiceSection title="어디서 하나요?">
        <ChoiceChips
          isSelected={(value) => condition.location === value}
          onSelect={(value) => setCondition({ ...condition, location: value })}
          options={locationOptions}
        />
      </ChoiceSection>
      <ChoiceSection aside="여러 개 고를 수 있어요" title="쓸 수 있는 기구">
        <ChoiceChips
          isSelected={(value) => condition.equipment.includes(value)}
          onSelect={toggleEquipment}
          options={equipmentOptions}
        />
      </ChoiceSection>
      <ChoiceSection title="오늘 컨디션">
        <ChoiceChips
          isSelected={(value) => condition.condition.trim() === value}
          onSelect={(value) => setCondition({ ...condition, condition: value })}
          options={conditionOptions}
        />
      </ChoiceSection>
      <AppTextField
        helperText="적어 주시면 추천할 때 참고해요."
        label="불편한 곳 (선택)"
        onChangeText={(value) => setCondition({ ...condition, discomfortArea: value })}
        placeholder="예) 오른쪽 무릎, 허리"
        value={condition.discomfortArea}
      />
      <Notice
        body="통증이 심하면 운동을 멈추고 전문가와 상담해 주세요."
        title="주의"
        tone="warning"
      />
    </SubScreen>
  );
}
