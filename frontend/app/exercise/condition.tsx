import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, BackHandler, Keyboard, Platform } from 'react-native';

import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { ConditionView } from '@/src/components/a/ConditionView';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import { initialExerciseCondition, type ExerciseCondition } from '@/src/features/exercise/exerciseData';

// What today is like, before a routine is made. What it asks the server is unchanged.
export default function ExerciseConditionScreen() {
  const router = useRouter();
  const { source, discomfortArea } = useLocalSearchParams<{ source?: string; discomfortArea?: string }>();
  const { condition: savedCondition, generateRoutine } = useExerciseRoutine();
  const isChanging = source === 'summary';
  const [initial] = useState<ExerciseCondition>(() =>
    isChanging
      ? { ...savedCondition, equipment: [...savedCondition.equipment] }
      : { ...initialExerciseCondition, equipment: [], discomfortArea: discomfortArea?.slice(0, 50) ?? '' },
  );
  const [condition, setCondition] = useState<ExerciseCondition>(initial);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const goBack = useCallback(
    () => (isChanging ? router.back() : router.replace('/exercise')),
    [isChanging, router],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  const goHome = () => {
    setLeaveDialogOpen(false);
    router.replace('/home');
  };
  const showError = (title: string, message: string) => {
    if (Platform.OS === 'web') setGenerateError(`${title} ${message}`);
    else Alert.alert(title, message);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setGenerateError('');
    if (
      condition.availableMinutes === null ||
      condition.location === null ||
      !condition.condition.trim()
    ) {
      showError('운동 설정을 확인해 주세요.', '운동 시간, 장소, 오늘 컨디션을 선택해 주세요.');
      return;
    }
    if (condition.discomfortArea.trim().length > 50) {
      showError('불편한 부위를 확인해 주세요.', '50자 이하로 입력해 주세요.');
      return;
    }
    setIsGenerating(true);
    Keyboard.dismiss();
    try {
      await generateRoutine({
        ...condition,
        condition: condition.condition.trim(),
        discomfortArea: condition.discomfortArea.trim(),
      });
      if (isChanging) router.dismissTo('/exercise/summary');
      else router.push('/exercise/summary');
    } catch (error) {
      showError('맞춤 운동을 만들지 못했어요.', getExerciseApiErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <ConditionView
        busy={isGenerating}
        error={generateError}
        onBack={goBack}
        onChange={(next) => {
          setGenerateError('');
          setCondition(next);
        }}
        onGo={() => void handleGenerate()}
        onHome={() => (JSON.stringify(condition) === JSON.stringify(initial) ? goHome() : setLeaveDialogOpen(true))}
        value={condition}
      />
      <ConfirmDialog
        description="고른 내용은 저장되지 않아요."
        onPrimary={goHome}
        onSecondary={() => setLeaveDialogOpen(false)}
        primaryLabel="나가기"
        secondaryLabel="계속 고르기"
        title="홈으로 나갈까요?"
        visible={leaveDialogOpen}
      />
    </>
  );
}
