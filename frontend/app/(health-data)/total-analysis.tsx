import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getHome, type HomeResponse } from '@/src/api/home';
import {
  getLatestHealthAnalysis,
  getHealthAssessmentPopups,
  getHealthAnalysisErrorMessage,
  isHealthAnalysisNotFound,
} from '@/src/api/healthAnalysis';
import { TotalAnalysisView } from '@/src/components/analysis/TotalAnalysisView';
import {
  createAnalysisDisplayData,
  type AnalysisDisplayData,
} from '@/src/components/analysis/totalAnalysisData';

export default function TotalAnalysisScreen() {
  const router = useRouter();
  const [data, setData] = useState<AnalysisDisplayData | null>(null);
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setState('loading');
      void getHome()
        .then((response) => {
          if (live) setHome(response);
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

  return (
    <TotalAnalysisView
      data={data}
      error={error}
      health={
        home
          ? {
              score: home.health_score.score,
              total: home.health_score.total_score,
              change: home.score_change.change,
              message: home.score_change.message,
            }
          : null
      }
      onBack={() => router.back()}
      onGoExercise={() => {
        router.dismissAll();
        router.replace('/exercise');
      }}
      onOpenDiet={() => router.push('/diet')}
      onOpenExercise={() => router.push('/exercise')}
      onOpenTier={() => router.push('/tier')}
      onRetry={() => setAttempt((value) => value + 1)}
      onUpload={() => router.push('/upload')}
      state={state}
    />
  );
}
