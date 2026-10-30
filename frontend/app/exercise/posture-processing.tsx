import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPostureJob, type PostureJob } from '@/src/api/posture';
import { fontFamilies } from '@/src/theme';

const steps = [
  { stage: 'upload', title: '영상 올리기', description: '분석할 영상을 안전하게 전달했어요' },
  { stage: 'joint_detection', title: '관절 찾기', description: '몸의 관절 위치를 확인하고 있어요' },
  { stage: 'posture_scoring', title: '자세 판단', description: '회차별 자세와 각도를 살펴봐요' },
  { stage: 'result_summary', title: '결과 정리', description: '잘한 점과 고칠 점을 정리해요' },
] as const;

const stageIndex: Record<PostureJob['analysis_stage'], number> = {
  waiting: 0, joint_detection: 1, posture_scoring: 2,
  result_summary: 3, complete: 4, failed: 0,
};

export default function PostureProcessingScreen() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<PostureJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setJob(null);
    setError(null);
    setLoading(true);
    if (!jobId) {
      setError('분석 작업이 아직 시작되지 않았습니다.');
      setLoading(false);
      return () => { active = false; };
    }
    const load = async () => {
      try {
        const next = await getPostureJob(jobId);
        if (!active) return;
        setJob(next);
        setError(null);
        setLoading(false);
        if (next.status === 'completed') {
          router.replace({ pathname: '/exercise/posture-result', params: { jobId } });
        } else if (next.status === 'processing' || next.status === 'cleanup_pending' || next.status === 'awaiting_upload') {
          timer = setTimeout(load, 3000);
        }
      } catch {
        if (!active) return;
        setError('분석 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');
        setLoading(false);
      }
    };
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [jobId, router]));

  const currentStage = job ? stageIndex[job.analysis_stage] : 0;
  const isFailed = job?.status === 'failed';
  return (
    <View style={[styles.screen, { paddingTop: insets.top }] }>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable accessibilityLabel="뒤로 가기" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>자세 분석 중</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.visual}>
          <View style={styles.visualPill}><Text style={styles.visualPillText}>{job?.detected_repetitions ?? 0}회 동작 확인</Text></View>
          <View style={styles.figure}>
            <View style={styles.head} /><View style={styles.body} /><View style={styles.arm} />
            <View style={styles.thigh} /><View style={styles.shin} />
          </View>
          <View style={styles.floor} />
        </View>
        <Text style={styles.heading}>{isFailed ? '분석을 완료하지 못했어요' : error ? '분석 상태를 확인할 수 없어요' : '자세를 보고 있어요'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>스쿼트 · 옆에서 촬영</Text>
          <Text style={styles.metaStrong}>{job ? `${job.progress_percent}%` : '대기 중'}</Text>
        </View>
        <View style={styles.track}><View style={[styles.progress, { width: `${job?.progress_percent ?? 0}%` }]} /></View>
        {loading && <ActivityIndicator color="#503DE1" style={styles.loading} />}
        {(error || isFailed) && <Text style={styles.error}>{error ?? '분석 중 문제가 발생했습니다. 다시 촬영해 주세요.'}</Text>}
        <View style={styles.stepCard}>
          {steps.map((step, index) => {
            const completed = job?.status === 'completed' || (job?.status !== 'failed' && index < currentStage);
            const active = !isFailed && index === currentStage;
            return <View key={step.stage} style={[styles.step, index > 0 && styles.stepBorder]}>
              <View style={[styles.stepIcon, completed && styles.stepDone, active && styles.stepActive]}><Text style={[styles.stepIconText, completed && styles.stepDoneText]}>{completed ? '✓' : index + 1}</Text></View>
              <View style={styles.stepCopy}><Text style={styles.stepTitle}>{step.title}</Text><Text style={styles.stepDescription}>{step.description}</Text></View>
              {active && job && <Text style={styles.stepPercent}>{step.stage === 'joint_detection' && job.total_frames ? `${job.processed_frames}/${job.total_frames}` : `${job.progress_percent}%`}</Text>}
            </View>;
          })}
        </View>
        <Text style={styles.note}>분석이 끝나면 임시 영상은 삭제하고 관절 위치와 점검 결과만 저장해요.</Text>
        <Text style={styles.note}>화면을 나가도 분석 상태는 계속 확인할 수 있어요.</Text>
        <Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>다른 화면 보기</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  back: { width: 36, alignItems: 'flex-start', justifyContent: 'center' }, backText: { fontSize: 36, color: '#19191D', lineHeight: 40 },
  headerTitle: { fontFamily: fontFamilies.pretendardBold, fontSize: 16, color: '#19191D' },
  content: { paddingHorizontal: 20 },
  visual: { height: 250, backgroundColor: '#1B1E21', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  visualPill: { position: 'absolute', zIndex: 1, top: 14, left: 14, backgroundColor: '#101114', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10 },
  visualPillText: { color: '#FFFFFF', fontSize: 11, fontFamily: fontFamilies.pretendardMedium },
  figure: { position: 'absolute', top: 32, left: '49%', width: 110, height: 180, transform: [{ rotate: '17deg' }] },
  head: { position: 'absolute', left: 44, top: 0, width: 25, height: 25, borderRadius: 13, backgroundColor: '#727477' },
  body: { position: 'absolute', left: 48, top: 22, width: 13, height: 74, borderRadius: 8, backgroundColor: '#727477' },
  arm: { position: 'absolute', left: 50, top: 55, width: 50, height: 10, borderRadius: 5, backgroundColor: '#727477', transform: [{ rotate: '-14deg' }] },
  thigh: { position: 'absolute', left: 20, top: 92, width: 55, height: 12, borderRadius: 7, backgroundColor: '#727477', transform: [{ rotate: '22deg' }] },
  shin: { position: 'absolute', left: 17, top: 105, width: 12, height: 65, borderRadius: 7, backgroundColor: '#727477', transform: [{ rotate: '12deg' }] },
  floor: { position: 'absolute', bottom: 28, height: 2, width: '100%', backgroundColor: '#65D999' },
  heading: { color: '#19191D', fontSize: 19, fontFamily: fontFamilies.pretendardBold, marginTop: 24, marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' }, meta: { color: '#686970', fontSize: 13 }, metaStrong: { color: '#19191D', fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  track: { height: 7, borderRadius: 4, backgroundColor: '#DFE0E3', marginTop: 10, overflow: 'hidden' }, progress: { height: '100%', backgroundColor: '#503DE1', borderRadius: 4 },
  loading: { marginTop: 18 }, error: { color: '#C34543', fontSize: 13, marginTop: 16, lineHeight: 19 },
  stepCard: { marginTop: 20, borderWidth: 1, borderColor: '#DDE0E6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#F9FAFB' },
  step: { flexDirection: 'row', alignItems: 'center', minHeight: 62 }, stepBorder: { borderTopWidth: 1, borderTopColor: '#E2E4E8' },
  stepIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#DFE2E6', backgroundColor: '#F1F3F5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepDone: { backgroundColor: '#E5F7ED', borderColor: '#E5F7ED' }, stepActive: { borderColor: '#503DE1', backgroundColor: '#EEEAFE' },
  stepIconText: { color: '#9699A0', fontSize: 12 }, stepDoneText: { color: '#16965E' }, stepCopy: { flex: 1 },
  stepTitle: { color: '#222227', fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold }, stepDescription: { color: '#85878D', fontSize: 11, marginTop: 3 }, stepPercent: { color: '#222227', fontSize: 11 },
  note: { color: '#777982', fontSize: 11, lineHeight: 17, marginTop: 16 },
  button: { backgroundColor: '#F1F2F4', borderRadius: 12, minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  buttonText: { color: '#1B1B20', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
});
