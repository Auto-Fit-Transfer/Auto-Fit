import { useLocalSearchParams } from 'expo-router';
import type { ScoreCard } from '@/src/features/healthScore';
import { useState } from 'react';

import { devHealthAnalysisFallback } from '@/src/api/healthAnalysis.dev';
import { AnalysisView } from '@/src/components/a/AnalysisView';
import { TotalAnalysisBottomSheet, type AnalysisSheetState } from '@/src/components/analysis/TotalAnalysisBottomSheet';
import { createAnalysisDisplayData } from '@/src/components/analysis/totalAnalysisData';

// Development only: renewal A's 종합 건강 분석 with the project's sample analysis, to look at it without
// signing in. ?state=empty | error | loading | open (the first number's box)
const nothing = () => undefined;
const data = createAnalysisDisplayData(devHealthAnalysisFallback.analysis, devHealthAnalysisFallback.popups);

export default function AAnalysisSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [sheet, setSheet] = useState<AnalysisSheetState>(state === 'open' && data.metricCriteria[0] ? { type: 'criterion', criterion: data.metricCriteria[0] } : null);
  const shown = state === 'empty' || state === 'error' || state === 'loading' ? state : 'ready';
  // ?state=partial (only the health-data part scored) | check (it could not be) | scorefail (could not be read)
  const card: ScoreCard = state === 'partial' ? { kind: 'partial', score: 80 } : state === 'check' ? { kind: 'check' } : state === 'scorefail' ? { kind: 'failed' } : state === 'empty' ? { kind: 'none' } : { kind: 'overall', score: 78, total: 100 };
  const openReference = (id: string) => {
    const reference = data.references.find((item) => item.id === id);
    if (reference) setSheet({ type: 'reference', reference });
  };
  return (
    <>
      <AnalysisView
        data={shown === 'ready' ? data : null}
        card={card}
        delta={2}
        error="분석을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        message="지난 검진보다 체지방률이 내려가 점수가 올랐어요."
        onBack={nothing}
        onCriterion={(criterion) => setSheet({ type: 'criterion', criterion })}
        onDiet={nothing}
        onExercise={nothing}
        onReason={(reason) => setSheet({ type: 'additional', reason })}
        onReference={openReference}
        onRetry={nothing}
        onTier={nothing}
        onUpload={nothing}
        onDocs={nothing}
        state={shown}
        tier={{ left: 'ACTIVE까지 120점', name: 'BALANCE', stars: 2 }}
        tierIndex={1}
        who="worker-f"
      />
      <TotalAnalysisBottomSheet sheet={sheet} onClose={() => setSheet(null)} onOpenReference={openReference} />
    </>
  );
}
