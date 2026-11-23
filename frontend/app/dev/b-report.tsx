import { useLocalSearchParams } from 'expo-router';

import { ReportView } from '@/src/components/b/ReportView';
import { countWeek, weekFrame } from '@/src/features/a/weekReport';
import type { TierLook } from '@/src/features/tier/tierLook';

// Development only: renewal B's report with a sample week, to look at it without signing in.
// ?state=first (nothing recorded yet, no health paper)
const nothing = () => undefined;
const fill = [
  { minutes: 20, exercises: ['맨몸 스쿼트', '런지', '카프 레이즈'], kcal: 1630, kcalGoal: 1700, protein: 90, proteinGoal: 100 },
  { kcal: 1840, kcalGoal: 1700, protein: 80, proteinGoal: 100 },
  { minutes: 28, exercises: ['맨몸 스쿼트', '플랭크'], kcal: 1550, kcalGoal: 1700, protein: 82, proteinGoal: 100 },
  { kcal: 480, kcalGoal: 1700, protein: 20, proteinGoal: 100 },
];
// Thursday 12 November 2026, the design's "today".
const frame = weekFrame(new Date(2026, 10, 12, 9));
const goals = { steps: 6000, water: 6 };
const week = countWeek(frame.map((day, index) => ({ ...day, ...(fill[index] ?? {}) })), goals);
const firstDay = countWeek(frame, goals);
const tier: TierLook = { index: 1, name: 'BALANCE', stars: 2, ratio: 46, left: '120점', next: 'ACTIVE까지' };
const trend = {
  weight: [56.6, 56.3, 55.8, 55.4, 55.0].map((kg, index) => ({ date: `2026-${index < 3 ? 10 : 11}-${['14', '21', '28', '04', '11'][index]}`, kg })),
  score: { value: 78, change: 2 },
};

export default function BReportSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const first = state === 'first';
  return (
    <ReportView
      count={first ? firstDay : week}
      onAsk={nothing}
      onBack={nothing}
      onGo={nothing}
      onHistory={nothing}
      onRecords={nothing}
      onTier={nothing}
      onUpload={nothing}
      tier={tier}
      trend={first ? { weight: [], score: null } : trend}
    />
  );
}
