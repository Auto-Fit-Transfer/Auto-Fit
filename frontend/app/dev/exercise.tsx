import { Redirect, useRouter, type Href } from 'expo-router';
import { Alert, View } from 'react-native';

import { AppButton } from '@/src/components/common';
import { useExerciseSession } from '@/src/features/exercise/ExerciseSessionContext';
import type { ExerciseItem, ExerciseRoutine } from '@/src/features/exercise/exerciseData';
import { useAppTheme } from '@/src/theme';

const item = (
  id: string,
  name: string,
  sets: number,
  repetitions: number | null,
  seconds: number | null,
  instruction: string,
): ExerciseItem => ({
  caloriesBurned: null,
  demoVideoUrl: null,
  durationMinutes: null,
  executionType: seconds ? 'time_based' : 'reps',
  id,
  instruction,
  intensity: null,
  name,
  prescription: seconds ? `${sets}세트 × ${seconds}초` : `${sets}세트 × ${repetitions}회`,
  recommendationId: null,
  repetitions,
  restSeconds: 45,
  sequenceOrder: Number(id),
  sets,
  targetDurationSeconds: seconds,
  targetWeightKg: null,
  thumbnailUrl: null,
});

// The routine from the Figma E2 / E4 samples.
const sampleRoutine: ExerciseRoutine = {
  id: 'dev-routine',
  title: '집에서 하는 전신 루틴',
  subtitle: '',
  intensity: '보통',
  estimatedCalories: 280,
  totalDurationMinutes: 45,
  reasons: [],
  exercises: [
    item('1', '밴드 로우', 3, 12, null, '가슴을 펴고 어깨가 올라가지 않게 천천히 당겨 주세요.'),
    item('2', '글루트 브리지', 3, 15, null, '엉덩이를 조이며 천천히 올려 주세요.'),
    item('3', '플랭크', 3, null, 30, '허리가 처지지 않게 배에 힘을 주세요.'),
  ],
};

// Development-only page that starts a sample workout on this device and opens the session
// screen (Figma E4 · E5). Results are not saved without signing in.
export default function DevExercise() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { beginSession } = useExerciseSession();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ backgroundColor: colors.background, flex: 1, padding: 16 }}>
      <AppButton
        onPress={() => {
          try {
            beginSession(sampleRoutine, {
              items: sampleRoutine.exercises.map((exercise) => ({
                exercise_item_id: exercise.id,
                exercise_session_item_id: `dev-item-${exercise.id}`,
              })),
              session: { exercise_session_id: 'dev-session' },
            });
            router.push('/exercise/session' as Href);
          } catch (error) {
            console.error('Sample workout start failed:', error);
            Alert.alert('예시 운동을 시작하지 못했어요', String(error));
          }
        }}
        title="예시 운동 시작하기"
      />
    </View>
  );
}
