import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ReportDetailView, ReportSummaryView } from '@/src/components/a/ReportViews';
import { countWeek, weekFrame, type Part } from '@/src/features/a/weekReport';
import type { TierLook } from '@/src/features/tier/tierLook';

// Development only: renewal A's report with a sample week (the design's own: a-report.html), to look at it
// without signing in. ?state=detail | food | ask | low | up (자세히 and its boxes) | day (Monday's box is
// one tap away) | first (nothing recorded yet, no health paper) | still (결산 without the counting up)
const nothing = () => undefined;
const fill = [
  { minutes: 20, exercises: ['전신 워밍업 스트레칭', '맨몸 스쿼트', '런지', '카프 레이즈'], kcal: 1630, kcalGoal: 1700, protein: 90, proteinGoal: 100, steps: 7240, water: 6, stretch: true },
  { kcal: 1840, kcalGoal: 1700, protein: 80, proteinGoal: 100, steps: 6310, water: 6 },
  { minutes: 20, exercises: ['맨몸 스쿼트', '런지'], kcal: 1550, kcalGoal: 1700, protein: 82, proteinGoal: 100, steps: 5480, stretch: true },
  { kcal: 480, kcalGoal: 1700, protein: 20, proteinGoal: 100, steps: 4820, water: 2 },
];
// Thursday 12 November 2026, the design's "today".
const frame = weekFrame(new Date(2026, 10, 12, 9));
const goals = { steps: 6000, water: 6 };
const week = countWeek(frame.map((day, index) => ({ ...day, ...(fill[index] ?? {}) })), goals);
const firstDay = countWeek(frame, goals);
const tier: TierLook = { index: 1, name: 'BALANCE', stars: 2, ratio: 46, left: '120점', next: 'ACTIVE까지' };
const firstTier: TierLook = { index: 0, name: 'CORE', stars: 1, ratio: 0, left: '100점', next: 'BALANCE까지' };
const trend = {
  weight: [56.6, 56.3, 55.8, 55.4, 55.0].map((kg, index) => ({ date: `2026-${index < 3 ? 10 : 11}-${['14', '21', '28', '04', '11'][index]}`, kg })),
  score: { value: 78, change: 2 },
};

export default function AReportSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [detail, setDetail] = useState(['detail', 'food', 'ask', 'low', 'up'].includes(state ?? ''));
  const first = state === 'first';
  const count = first ? firstDay : week;
  return detail ? (
    <ReportDetailView
      count={count}
      name="지원"
      onAsk={nothing}
      onBack={() => setDetail(false)}
      onGo={nothing}
      onTier={nothing}
      sheet={state === 'food' || state === 'ask' ? state : state === 'low' || state === 'up' ? (state as Part) : undefined}
      tier={tier}
      tierIndex={tier.index}
      who="worker-f"
    />
  ) : (
    <ReportSummaryView
      count={count}
      onBack={nothing}
      onHistory={nothing}
      onMore={() => setDetail(true)}
      onRecords={nothing}
      onTier={nothing}
      onUpload={nothing}
      still={state === 'still' || first}
      tier={first ? firstTier : tier}
      tierIndex={first ? 0 : tier.index}
      trend={first ? { weight: [], score: null } : trend}
      who="worker-f"
    />
  );
}
