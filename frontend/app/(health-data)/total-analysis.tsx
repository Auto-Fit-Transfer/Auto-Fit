import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  getHealthAnalysisErrorMessage,
  getHealthAssessmentPopups,
  getLatestHealthAnalysis,
  isHealthAnalysisNotFound,
} from '@/src/api/healthAnalysis';
import { getHome, type HomeResponse } from '@/src/api/home';
import { getHabitTierProgress } from '@/src/api/tier';
import { AnalysisView } from '@/src/components/a/AnalysisView';
import { useKeptWho } from '@/src/components/a/useKeptWho';
import { TotalAnalysisBottomSheet, type AnalysisSheetState } from '@/src/components/analysis/TotalAnalysisBottomSheet';
import { createAnalysisDisplayData, type AnalysisDisplayData } from '@/src/components/analysis/totalAnalysisData';
import { tierLook, type TierLook } from '@/src/features/tier/tierLook';

// 종합 건강 분석: the latest analysis, my health score and my tier, read when the screen comes into view.
export default function TotalAnalysisScreen() {
  const router = useRouter();
  const who = useKeptWho();
  const [data, setData] = useState<AnalysisDisplayData | null>(null);
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [tier, setTier] = useState<TierLook | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState<AnalysisSheetState>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setState('loading');
      setTier(null);
      void getHabitTierProgress().then(({ progress }) => {
        if (live) setTier(tierLook(progress));
      }).catch(() => {
        if (live) setTier(null);
      });
      void getHome()
        .then((r) => {
          if (live) setHome(r);
        })
        .catch(() => {
          if (live) setHome(null);
        });
      void (async () => {
        try {
          const analysis = await getLatestHealthAnalysis();
          const popups = await getHealthAssessmentPopups(analysis.assessment_id);
          if (live) {
            setData(createAnalysisDisplayData(analysis, popups));
            setState('ready');
          }
        } catch (e) {
          if (live) {
            setData(null);
            setState(isHealthAnalysisNotFound(e) ? 'empty' : 'error');
            setError(getHealthAnalysisErrorMessage(e));
          }
        }
      })();
      return () => {
        live = false;
      };
      // A retry deliberately replaces the focus callback and cancels its previous request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]),
  );
  const openReference = (id: string) => {
    const reference = data?.references.find((r) => r.id === id);
    if (reference) setSheet({ type: 'reference', reference });
  };
  return (
    <>
      <AnalysisView
        data={data}
        delta={home?.score_change.change ?? null}
        error={error}
        message={home?.score_change.message || null}
        onBack={() => router.back()}
        onCriterion={(criterion) => setSheet({ type: 'criterion', criterion })}
        onDiet={() => router.push('/diet')}
        onExercise={() => router.push('/exercise')}
        onReason={(reason) => setSheet({ type: 'additional', reason })}
        onReference={openReference}
        onRetry={() => setAttempt((v) => v + 1)}
        onTier={() => router.push('/tier')}
        onUpload={() => router.push('/upload')}
        score={home?.health_score.score ?? null}
        state={state}
        tier={tier ? { left: `${tier.next} ${tier.left}`, name: tier.name, stars: tier.stars } : null}
        tierIndex={tier?.index ?? 0}
        total={home?.health_score.total_score ?? null}
        who={who}
      />
      <TotalAnalysisBottomSheet sheet={sheet} onClose={() => setSheet(null)} onOpenReference={openReference} />
    </>
  );
}
