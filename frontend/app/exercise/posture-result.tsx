import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getPostureResult, type PostureResult } from '@/src/api/posture';
import { PostureResultView } from '@/src/components/a/PostureViews';
import { angleRow, secondsLabel } from '@/src/features/exercise/postureFlow';

// Renewal A's 자세 분석, the result (src/components/a/PostureViews.tsx shows it). This file reads the
// result and hands over its numbers: the score, each repetition's measured angles, what to fix, and
// what went well.
export default function PostureResultScreen() {
  const { jobId, name } = useLocalSearchParams<{ jobId?: string; name?: string }>();
  const router = useRouter();
  const [result, setResult] = useState<PostureResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    setResult(null);
    setError(null);
    setLoading(true);
    if (!jobId) { setLoading(false); setError('분석 작업을 선택해 주세요.'); return () => { active = false; }; }
    void getPostureResult(jobId).then((next) => {
      if (!active) return;
      setResult(next);
      setError(null); setLoading(false);
    }).catch(() => { if (active) { setError('분석 결과를 불러오지 못했습니다.'); setLoading(false); } });
    return () => { active = false; };
  }, [jobId]));

  const when = (start: number | null, end: number | null) =>
    start == null ? '' : `${start}${end && end !== start ? `~${end}` : ''}회째`;

  return (
    <PostureResultView
      fixes={(result?.findings ?? []).filter((finding) => finding.finding_type === 'correction').map((finding) => ({
        id: finding.posture_finding_id,
        title: finding.title,
        when: when(finding.repetition_start, finding.repetition_end),
        why: finding.explanation,
        steps: [...finding.guidance_steps].sort((a, b) => a.sequence_order - b.sequence_order).map((step) => step.instruction),
      }))}
      goods={(result?.findings ?? []).filter((finding) => finding.finding_type === 'positive').map((finding) => finding.title)}
      loading={loading}
      onAgain={() => router.replace({ pathname: '/exercise/posture-capture', params: { exerciseCode: result?.job.exercise_code ?? '', cameraView: result?.job.camera_view ?? '' } })}
      onBack={() => router.back()}
      onHome={() => router.replace('/home')}
      passing={result?.assessment.passing_score ?? null}
      problem={error}
      reps={(result?.repetitions ?? []).map((rep) => ({
        id: rep.posture_repetition_id,
        number: rep.repetition_number,
        score: rep.score,
        scene: secondsLabel(rep.keyframe_offset_ms),
        angles: rep.angles.map(angleRow),
      }))}
      score={result?.assessment.overall_score ?? 0}
      summary={result?.assessment.summary ?? ''}
      title={name ? `${name} 자세 결과` : '자세 결과'}
    />
  );
}
