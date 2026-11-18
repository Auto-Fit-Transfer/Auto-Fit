import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { WorkoutDoneView, type PostCondition } from '@/src/components/a/WorkoutDoneView';

// Development only: renewal A's workout result with a sample workout, to look at it without signing in.
// ?state=answered (how it felt is answered, something hurt) | skipped (one move skipped) | bare (the app
// was closed in between: only the totals are left)
const nothing = () => undefined;

export default function ADoneSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [difficulty, setDifficulty] = useState<number | null>(state === 'answered' ? 4 : null);
  const [hadPain, setHadPain] = useState(state === 'answered');
  const [areas, setAreas] = useState<string[]>(state === 'answered' ? ['waist'] : []);
  const [change, setChange] = useState<PostCondition>('normal');
  const bare = state === 'bare';
  const skipped = state === 'skipped';
  const noPoints = state === 'nopoints'; // ?state=nopoints: the +5 rule was not met
  return (
    <WorkoutDoneView
      areas={areas}
      button={{ disabled: false, label: '완료' }}
      change={change}
      count={3}
      difficulty={difficulty}
      finished
      hadPain={hadPain}
      kcal={bare ? null : 70}
      minutes={8}
      noPoints={noPoints}
      onBack={nothing}
      onChange={setChange}
      onDifficulty={setDifficulty}
      onDone={nothing}
      onHadPain={setHadPain}
      onHistory={nothing}
      onShare={nothing}
      onToggleArea={(area) => setAreas((current) => (current.includes(area) ? current.filter((item) => item !== area) : [...current, area]))}
      rows={bare ? [] : [
        { name: '크런치', text: '3세트 · 20회' },
        { name: '러시안 트위스트', text: skipped ? '건너뜀' : '3세트 중 2세트 · 24회' },
        { name: '플랭크', text: '3세트 · 60초' },
      ]}
      stars={bare ? null : [true, !skipped]}
      tier={{ index: 1, name: 'BALANCE', stars: 2, ratio: 52, left: '115점', next: 'ACTIVE까지' }}
      tierIndex={1}
      title="코어 루틴"
      who="worker-f"
    />
  );
}
