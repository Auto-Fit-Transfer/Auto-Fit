import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ConditionView } from '@/src/components/a/ConditionView';
import type { ExerciseCondition } from '@/src/features/exercise/exerciseData';

// Development only: renewal A's "what is today like" with nothing sent anywhere, to look at it without
// signing in. ?state=filled (answers chosen) | busy (the routine is being made) | error
const nothing = () => undefined;

export default function AConditionSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [value, setValue] = useState<ExerciseCondition>(
    state ? { availableMinutes: 45, condition: '보통', discomfortArea: '오른쪽 무릎', equipment: ['bodyweight', 'band'], location: 'home' }
      : { availableMinutes: null, condition: '', discomfortArea: '', equipment: [], location: null },
  );
  return (
    <ConditionView
      busy={state === 'busy'}
      error={state === 'error' ? '운동 설정을 확인해 주세요. 운동 시간, 장소, 오늘 컨디션을 선택해 주세요.' : ''}
      onBack={nothing}
      onChange={setValue}
      onGo={nothing}
      onHome={nothing}
      value={value}
    />
  );
}
