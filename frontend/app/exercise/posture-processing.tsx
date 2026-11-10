import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/ui/check.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { ApiError, getApiErrorMessage } from '@/src/api/client';
import { createPostureJob, getPostureCapabilities, getPostureJob, uploadPostureVideo, type PostureVideo } from '@/src/api/posture';
import { recoveryAction, stepOf } from '@/src/features/exercise/postureFlow';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

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

export default function PostureProcessingScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const video: PostureVideo | null = params.videoUri && params.mimeType && params.name
    ? { uri: params.videoUri, mimeType: params.mimeType, name: params.name } : null;
  const seconds = Math.round(Number(params.durationMs) / 1000);

  const showResult = useCallback((jobId: string) => {
    setStep(3);
    router.replace({ pathname: '/exercise/posture-result', params: { jobId } });
  }, [router]);

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
    setError(''); setNext(null); setStep(0);
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
    if (video) void run();
    else if (params.jobId) void follow(params.jobId, false);
    else setError('분석할 영상이 없어요. 다시 찍어 주세요.');
    return () => {
      aliveRef.current = false;
      deleteLocalVideo(params.videoUri);
    };
    // Runs once per screen; the video and job come from the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const again = () => router.replace({ pathname: '/exercise/posture-capture', params: { exerciseCode: params.exerciseCode ?? '', cameraView: params.cameraView ?? '' } });

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => router.back()} title="자세 분석 중" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.heading}>{error ? '분석을 마치지 못했어요' : '자세를 분석하고 있어요'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{params.label || '스쿼트 · 옆에서'}{seconds > 0 ? ` · ${seconds}초 영상` : ''}</Text>
          {!error ? <Text style={styles.metaStrong}>보통 10초 안에 끝나요</Text> : null}
        </View>
        <View style={styles.stepCard}>
          {steps.map((item, index) => {
            const done = index < step;
            const active = !error && index === step;
            return <View key={item.title} style={[styles.step, index > 0 && styles.stepBorder]}>
              <View style={[styles.stepIcon, done && styles.stepDone]}>
                {done ? <CheckIcon color={colors.success} height={14} width={14} />
                  : active ? <ActivityIndicator color={colors.textPrimary} size="small" />
                    : <Text style={styles.stepIconText}>{index + 1}</Text>}
              </View>
              <View style={styles.stepCopy}>
                <Text style={[styles.stepTitle, !done && !active && styles.stepWaiting]}>{item.title}</Text>
                <Text style={styles.stepDescription}>{index === 0 && done && seconds > 0 ? `${seconds}초 영상을 보냈어요` : item.description}</Text>
              </View>
            </View>;
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.noteRow}><LockIcon color={colors.textSecondary} height={14} width={14} /><Text style={styles.note}>분석이 끝나면 영상은 바로 지우고, 관절 위치와 결과만 남겨요.</Text></View>
        {next === 'retry' ? <Pressable accessibilityRole="button" onPress={() => void run()} style={styles.primary}><Text style={styles.primaryText}>다시 보내기</Text></Pressable> : null}
        {next ? <Pressable accessibilityRole="button" onPress={again} style={styles.secondary}><Text style={styles.secondaryText}>다시 찍기</Text></Pressable> : null}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, gap: 16 },
    heading: { color: colors.textPrimary, fontSize: 20, fontFamily: fontFamilies.pretendardBold },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: -6 },
    meta: { color: colors.textSecondary, fontSize: 14, flexShrink: 1 },
    metaStrong: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    stepCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: colors.surface },
    step: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
    stepBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    stepIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    stepDone: { backgroundColor: colors.successLight, borderColor: colors.successLight },
    stepIconText: { color: colors.textSecondary, fontSize: 12 },
    stepCopy: { flex: 1 },
    stepTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    stepWaiting: { color: colors.textSecondary },
    stepDescription: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    note: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 },
    primary: { backgroundColor: colors.primary, borderRadius: 12, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    secondary: { backgroundColor: colors.surfaceMuted, borderRadius: 12, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  } as const;
}
