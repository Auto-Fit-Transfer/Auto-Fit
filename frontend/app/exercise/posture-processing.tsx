import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { ApiError, getApiErrorMessage } from '@/src/api/client';
import { createPostureJob, getPostureCapabilities, getPostureJob, uploadPostureVideo, type PostureVideo } from '@/src/api/posture';
import { PostureWaitView } from '@/src/components/a/PostureViews';
import { recoveryAction, stepOf } from '@/src/features/exercise/postureFlow';

const steps = [
  { title: '영상 올리기', description: '영상을 서버로 보내요' },
  { title: '자세 분석', description: '관절을 찾고 각도를 재요' },
  { title: '결과 정리', description: '잘한 점과 고칠 점을 골라요' },
] as const;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deleteLocalVideo(uri: string | undefined) {
  if (Platform.OS === 'web' || !uri?.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* Best effort; the cache folder is cleared by the system too. */ }
}

function problemText(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.status === 413) return '영상이 너무 커요. 50MB 이하로 다시 찍어 주세요.';
    if (cause.status === 409) return '이미 진행 중인 자세 분석이 있어요. 잠시 뒤 다시 시도해 주세요.';
    if (cause.status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
    if (cause.status === 0 || cause.status >= 500) return '분석 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }
  return getApiErrorMessage(cause);
}

// Renewal A's 자세 분석, waiting (src/components/a/PostureViews.tsx shows it). This file sends the
// video, follows the job and goes on to the result.
export default function PostureProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    jobId?: string; videoUri?: string; mimeType?: string; name?: string; durationMs?: string;
    exerciseCode?: string; cameraView?: string; label?: string;
  }>();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  // 'retry' keeps the same job (still waiting for a video); 'again' needs a new recording.
  const [next, setNext] = useState<'retry' | 'again' | null>(null);
  const jobRef = useRef<string | null>(params.jobId ?? null);
  const aliveRef = useRef(true);
  const runningRef = useRef(false);
  const video = useMemo<PostureVideo | null>(() => (params.videoUri && params.mimeType && params.name
    ? { uri: params.videoUri, mimeType: params.mimeType, name: params.name } : null), [params.videoUri, params.mimeType, params.name]);
  const nothingToDo = !video && !params.jobId;
  const seconds = Math.round(Number(params.durationMs) / 1000);
  const label = params.label || '스쿼트 · 옆에서';

  const showResult = useCallback((jobId: string) => {
    setStep(3);
    // The result has no name of the exercise in it, so the one filmed is handed over for its title.
    router.replace({ pathname: '/exercise/posture-result', params: { jobId, name: label.split(' · ')[0] } });
  }, [label, router]);

  // The upload request returns only after analysis and cleanup, so the job is read alongside it for the steps.
  // While uploading this only moves the steps; without an upload in flight it also ends the screen.
  const follow = useCallback(async (jobId: string, duringUpload: boolean) => {
    while (aliveRef.current && (!duringUpload || runningRef.current)) {
      const job = await getPostureJob(jobId).catch(() => null);
      if (!aliveRef.current || (duringUpload && !runningRef.current)) return;
      if (job) setStep((current) => Math.max(current, stepOf(job.status)));
      if (!duringUpload && job?.status === 'completed') return showResult(jobId);
      if (!duringUpload && job?.status === 'failed') {
        setError('분석을 끝내지 못했어요. 온몸이 잘 보이게 다시 찍어 주세요.');
        setNext('again');
        return;
      }
      await wait(2000);
    }
  }, [showResult]);

  const run = useCallback(async () => {
    if (runningRef.current || !video) return;
    runningRef.current = true;
    let jobId = jobRef.current;
    try {
      if (!jobId) {
        const { exercises } = await getPostureCapabilities();
        const validated = exercises.filter((item) => item.validation_status === 'validated');
        const profile = validated.find((item) => item.exercise_code === params.exerciseCode && item.camera_view === params.cameraView) ?? validated[0];
        if (!profile) throw new Error('지금은 자세를 분석할 수 있는 운동이 없어요.');
        jobId = (await createPostureJob(profile)).posture_analysis_job_id;
        jobRef.current = jobId;
      }
      void follow(jobId, true);
      await uploadPostureVideo(jobId, video);
      runningRef.current = false;
      if (aliveRef.current) showResult(jobId);
    } catch (cause) {
      runningRef.current = false;
      if (!aliveRef.current) return;
      if (!jobId) { setError(problemText(cause)); setNext('again'); return; }
      // The contract: read the job before deciding, never resend blindly.
      const job = await getPostureJob(jobId).catch(() => null);
      const action = job ? recoveryAction(job.status) : 'reupload';
      if (action === 'result') return showResult(jobId);
      if (action === 'wait') return void follow(jobId, false);
      setError(problemText(cause));
      if (action === 'new_job') jobRef.current = null;
      setNext(action === 'reupload' ? 'retry' : 'again');
    }
  }, [follow, params.cameraView, params.exerciseCode, showResult, video]);

  useEffect(() => {
    aliveRef.current = true;
    // Every state change in run/follow comes after a network reply, never during this effect.
    const start = async () => {
      await Promise.resolve();
      if (video) await run();
      else if (params.jobId) await follow(params.jobId, false);
    };
    void start();
    return () => {
      aliveRef.current = false;
      deleteLocalVideo(params.videoUri);
    };
    // Runs once per screen; the video and job come from the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => { setError(''); setNext(null); setStep(0); void run(); };
  const shownError = error || (nothingToDo ? '분석할 영상이 없어요. 다시 찍어 주세요.' : '');
  const again = () => router.replace({ pathname: '/exercise/posture-capture', params: { exerciseCode: params.exerciseCode ?? '', cameraView: params.cameraView ?? '' } });

  return (
    <PostureWaitView
      error={shownError || null}
      failed={Boolean(shownError)}
      meta={`${label}${seconds > 0 ? ` · ${seconds}초 영상` : ''}`}
      onAgain={next || nothingToDo ? again : undefined}
      onBack={() => router.back()}
      onRetry={next === 'retry' ? retry : undefined}
      steps={steps.map((item, index) => ({
        title: item.title,
        description: index === 0 && index < step && seconds > 0 ? `${seconds}초 영상을 보냈어요` : item.description,
        state: index < step ? 'done' : index === step ? 'active' : 'waiting',
      }))}
    />
  );
}
