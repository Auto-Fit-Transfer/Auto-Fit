import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { getPostureResult, type PostureFinding, type PostureKeypoint, type PostureResult } from '@/src/api/posture';
import { fontFamilies } from '@/src/theme';

const links = [
  ['head', 'neck'], ['neck', 'left_shoulder'], ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'], ['left_shoulder', 'left_hip'], ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'], ['left_ankle', 'left_heel'], ['left_heel', 'left_foot_index'],
  ['neck', 'right_shoulder'], ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['right_shoulder', 'right_hip'], ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_heel'], ['right_heel', 'right_foot_index'],
] as const;

const angleNames: Record<string, string> = {
  torso_lean: '상체 기울기', knee_flexion: '무릎 각도',
  hip_flexion: '엉덩이 각도', ankle_dorsiflexion: '발목 각도',
};

function Skeleton({ points }: { points: PostureKeypoint[] }) {
  const byCode = new Map(points.map((point) => [point.joint_code, point]));
  const position = (point: PostureKeypoint) => ({ x: 24 + Number(point.x_normalized) * 312, y: 12 + Number(point.y_normalized) * 178 });
  return <View style={styles.skeletonBox}>
    {points.length === 0 ? <Text style={styles.noPoints}>관절 위치 기록이 없습니다.</Text> :
      <Svg width="100%" height="100%" viewBox="0 0 360 202" accessibilityLabel="선택한 회차의 관절 위치 도식">
        {links.map(([from, to]) => {
          const a = byCode.get(from); const b = byCode.get(to);
          if (!a || !b) return null;
          const start = position(a); const end = position(b);
          return <Line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#818387" strokeWidth={8} strokeLinecap="round" />;
        })}
        {points.map((point) => {
          const pos = position(point);
          return <Circle key={point.joint_code} cx={pos.x} cy={pos.y} r={4} fill="#77DEA6" />;
        })}
      </Svg>}
    <View style={styles.skeletonFloor} />
  </View>;
}

function FindingCard({ finding, expanded, onToggle, result }: {
  finding: PostureFinding; expanded: boolean; onToggle: () => void; result: PostureResult;
}) {
  const suggestion = result.routine_suggestions.find((item) => item.posture_finding_id === finding.posture_finding_id);
  return <View style={styles.findingCard}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.findingHeader}>
      <View style={{ flex: 1 }}><Text style={styles.findingTitle}>{finding.title}</Text>
        {finding.repetition_start != null && <Text style={styles.findingSub}>{finding.repetition_start}{finding.repetition_end && finding.repetition_end !== finding.repetition_start ? `~${finding.repetition_end}` : ''}회째</Text>}
      </View><Text style={styles.toggle}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <View style={styles.findingBody}>
      <Text style={styles.sectionLabel}>왜 그럴까요</Text><Text style={styles.bodyText}>{finding.explanation}</Text>
      {finding.guidance_steps.length > 0 && <><Text style={styles.sectionLabel}>이렇게 고쳐요</Text>
        {finding.guidance_steps.map((step) => <View key={step.sequence_order} style={styles.guidanceRow}>
          <View style={styles.guidanceNumber}><Text style={styles.guidanceNumberText}>{step.sequence_order}</Text></View>
          <Text style={[styles.bodyText, { flex: 1 }]}>{step.instruction}</Text>
        </View>)}</>}
      {suggestion && <View style={styles.suggestion}><Text style={styles.findingTitle}>{suggestion.exercise_name}</Text>
        <Text style={styles.findingSub}>{suggestion.prescription}</Text>
        <Text style={styles.suggestionStatus}>{suggestion.applied_at ? '루틴에 반영됨' : '루틴 연결 준비 중'}</Text>
      </View>}
    </View>}
  </View>;
}

export default function PostureResultScreen() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const router = useRouter(); const insets = useSafeAreaInsets();
  const [result, setResult] = useState<PostureResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setResult(null);
    setError(null);
    setLoading(true);
    if (!jobId) { setLoading(false); setError('분석 작업을 선택해 주세요.'); return () => { active = false; }; }
    void getPostureResult(jobId).then((next) => {
      if (!active) return;
      setResult(next); setSelectedId(next.repetitions.at(-1)?.posture_repetition_id ?? null);
      setError(null); setLoading(false);
    }).catch(() => { if (active) { setError('분석 결과를 불러오지 못했습니다.'); setLoading(false); } });
    return () => { active = false; };
  }, [jobId]));

  const selected = useMemo(() => result?.repetitions.find((rep) => rep.posture_repetition_id === selectedId) ?? result?.repetitions[0], [result, selectedId]);
  const corrections = result?.findings.filter((finding) => finding.finding_type === 'correction') ?? [];
  const positives = result?.findings.filter((finding) => finding.finding_type === 'positive') ?? [];
  const toggle = (id: string) => setExpandedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const date = result?.assessment.assessed_at ? new Date(result.assessment.assessed_at).toLocaleDateString('ko-KR') : '';

  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <StatusBar style="dark" />
    <View style={styles.header}><Pressable accessibilityLabel="뒤로 가기" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.headerTitle}>자세 점검 결과</Text><View style={styles.back} /></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {loading && <ActivityIndicator color="#503DE1" style={{ marginTop: 60 }} />}
      {error && <View style={styles.empty}><Text style={styles.emptyTitle}>결과를 표시할 수 없어요</Text><Text style={styles.bodyText}>{error}</Text><Pressable onPress={() => router.back()} style={styles.secondaryButton}><Text style={styles.buttonText}>돌아가기</Text></Pressable></View>}
      {result && <>
        <View style={styles.scoreCard}><View style={styles.scoreRow}><Text style={styles.score}>{result.assessment.overall_score}</Text><Text style={styles.scoreUnit}>점</Text></View>
          <Text style={styles.summary}>{result.assessment.summary}</Text>
          <View style={styles.chips}><Text style={styles.chip}>{date}</Text><Text style={styles.chip}>옆에서 {Math.round((result.job.capture_duration_ms ?? 0) / 1000)}초</Text><Text style={styles.chip}>{result.assessment.repetition_count}회 인식</Text></View>
        </View>
        <Text style={styles.sectionTitle}>{selected ? `${selected.repetition_number}회째 자세` : '회차별 자세'}</Text>
        <Skeleton points={selected?.keypoints ?? []} />
        {selected && selected.angles.length > 0 && <View style={styles.angleRow}>{selected.angles.map((angle) => <View style={styles.angleChip} key={angle.angle_code}><Text style={styles.angleText}>{angleNames[angle.angle_code] ?? angle.angle_code} {Number(angle.measured_degrees)}°</Text>{(angle.target_min_degrees != null || angle.target_max_degrees != null) && <Text style={styles.angleTarget}>목표 {angle.target_min_degrees != null ? `${Number(angle.target_min_degrees)}°` : ''}{angle.target_min_degrees != null && angle.target_max_degrees != null ? '~' : ''}{angle.target_max_degrees != null ? `${Number(angle.target_max_degrees)}°` : ''}</Text>}</View>)}</View>}
        <View style={styles.repRow}>{result.repetitions.map((rep) => <Pressable key={rep.posture_repetition_id} onPress={() => setSelectedId(rep.posture_repetition_id)} accessibilityRole="button" accessibilityState={{ selected: selected?.posture_repetition_id === rep.posture_repetition_id }} style={[styles.repButton, selected?.posture_repetition_id === rep.posture_repetition_id && styles.repSelected]}><Text style={[styles.repText, selected?.posture_repetition_id === rep.posture_repetition_id && styles.repSelectedText]}>{rep.repetition_number}회</Text></Pressable>)}</View>
        <View style={styles.chartCard}><View style={styles.chartHeading}><Text style={styles.findingTitle}>회차별 점수</Text><Text style={styles.findingSub}>점수가 낮은 회차를 확인해요</Text></View>
          <View style={styles.chart}>{result.repetitions.map((rep) => <View style={styles.barColumn} key={rep.posture_repetition_id}><View style={[styles.bar, { height: `${Math.max(8, rep.score)}%`, backgroundColor: result.assessment.passing_score != null && rep.score < result.assessment.passing_score ? '#B56C00' : '#222027' }]}><Text style={styles.barText}>{rep.score}</Text></View><Text style={styles.barLabel}>{rep.repetition_number}회</Text></View>)}</View>
          {result.assessment.passing_score != null && <Text style={styles.threshold}>기준 {result.assessment.passing_score}점</Text>}
        </View>
        {corrections.length > 0 && <><Text style={styles.sectionTitle}>고칠 점 {corrections.length}</Text>{corrections.map((finding) => <FindingCard key={finding.posture_finding_id} finding={finding} expanded={expandedIds.includes(finding.posture_finding_id)} onToggle={() => toggle(finding.posture_finding_id)} result={result} />)}</>}
        {positives.length > 0 && <View style={styles.positiveCard}><Text style={styles.findingTitle}>잘한 점</Text>{positives.map((finding) => <Text key={finding.posture_finding_id} style={styles.positiveText}>✓  {finding.title}</Text>)}</View>}
        {result.routine_suggestions.filter((item) => !item.posture_finding_id).map((item) => <View key={item.posture_routine_suggestion_id} style={styles.findingCard}><Text style={styles.findingTitle}>{item.exercise_name}</Text><Text style={styles.bodyText}>{item.prescription}</Text><Text style={styles.suggestionStatus}>{item.applied_at ? '루틴에 반영됨' : '루틴 연결 준비 중'}</Text></View>)}
        <Text style={styles.privacy}>임시 영상의 삭제 처리가 기록됐어요. 관절 위치와 결과만 저장됩니다.</Text>
        <View style={styles.actions}><Pressable onPress={() => router.replace('/exercise/posture-capture')} style={styles.secondaryButton}><Text style={styles.buttonText}>다시 찍기</Text></Pressable><Pressable onPress={() => router.back()} style={styles.primaryButton}><Text style={styles.primaryText}>운동으로 돌아가기</Text></Pressable></View>
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { height: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  back: { width: 36, alignItems: 'flex-start' }, backText: { fontSize: 36, color: '#19191D', lineHeight: 40 }, headerTitle: { fontFamily: fontFamilies.pretendardBold, color: '#19191D', fontSize: 16 },
  content: { paddingHorizontal: 20 }, empty: { marginTop: 40 }, emptyTitle: { fontSize: 18, fontFamily: fontFamilies.pretendardBold, marginBottom: 12 },
  scoreCard: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#DDE0E7', borderRadius: 16, padding: 16, marginTop: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' }, score: { fontSize: 34, fontFamily: fontFamilies.pretendardBold, color: '#1C1C21' }, scoreUnit: { fontSize: 15, marginLeft: 7, color: '#4B4C52' },
  summary: { color: '#55575E', fontSize: 14, lineHeight: 21, marginTop: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: '#DDE0E6', borderRadius: 5, color: '#4D4E54', fontSize: 11, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#FFFFFF' },
  sectionTitle: { fontSize: 15, color: '#202025', fontFamily: fontFamilies.pretendardSemiBold, marginTop: 25, marginBottom: 11 },
  skeletonBox: { height: 202, backgroundColor: '#1B1E21', borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, skeletonFloor: { position: 'absolute', bottom: 13, width: '100%', height: 2, backgroundColor: '#4D5255' }, noPoints: { color: '#FFFFFF', fontSize: 12 },
  angleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, angleChip: { borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#E8F8EE' }, angleText: { color: '#16885A', fontSize: 11 }, angleTarget: { color: '#527B63', fontSize: 10, marginTop: 2 },
  repRow: { flexDirection: 'row', gap: 6, marginTop: 12 }, repButton: { flex: 1, minHeight: 39, borderWidth: 1, borderColor: '#DDE0E6', backgroundColor: '#F9FAFB', borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, repSelected: { backgroundColor: '#503DE1', borderColor: '#503DE1' }, repText: { color: '#27282E', fontSize: 12 }, repSelectedText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold },
  chartCard: { borderWidth: 1, borderColor: '#DDE0E6', borderRadius: 16, padding: 16, marginTop: 19, backgroundColor: '#F9FAFB' }, chartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chart: { height: 145, flexDirection: 'row', gap: 10, alignItems: 'flex-end', justifyContent: 'center', marginTop: 19 }, barColumn: { flex: 1, height: 140, alignItems: 'center', justifyContent: 'flex-end' }, bar: { width: '60%', minWidth: 25, borderRadius: 5, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 5 }, barText: { color: '#FFFFFF', fontSize: 11 }, barLabel: { fontSize: 11, color: '#72747A', marginTop: 5 }, threshold: { color: '#72747A', fontSize: 11, textAlign: 'right', marginTop: 7 },
  findingCard: { borderWidth: 1, borderColor: '#DDE0E6', borderRadius: 15, padding: 15, backgroundColor: '#F9FAFB', marginBottom: 10 }, findingHeader: { flexDirection: 'row', alignItems: 'center' }, findingTitle: { color: '#23242A', fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold }, findingSub: { color: '#73757C', fontSize: 11, marginTop: 4 }, toggle: { color: '#33343A', fontSize: 22, width: 26, textAlign: 'center' },
  findingBody: { marginTop: 15 }, sectionLabel: { color: '#75777D', fontSize: 11, marginBottom: 8, marginTop: 8 }, bodyText: { color: '#44464D', fontSize: 13, lineHeight: 20 }, guidanceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }, guidanceNumber: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#DCE0E7', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 8 }, guidanceNumberText: { color: '#33343A', fontSize: 11 },
  suggestion: { borderWidth: 1, borderColor: '#DDE0E6', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginTop: 12 }, suggestionStatus: { color: '#6862AF', fontSize: 11, marginTop: 8 },
  positiveCard: { borderWidth: 1, borderColor: '#DDE0E6', borderRadius: 15, padding: 15, backgroundColor: '#F9FAFB', marginTop: 16 }, positiveText: { color: '#33343A', fontSize: 13, lineHeight: 20, marginTop: 9 },
  privacy: { color: '#777982', fontSize: 11, marginTop: 20, lineHeight: 17 }, actions: { flexDirection: 'row', gap: 8, marginTop: 27 },
  secondaryButton: { flex: 1, minHeight: 52, backgroundColor: '#F1F2F4', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#202126', fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
  primaryButton: { flex: 1, minHeight: 52, backgroundColor: '#503DE1', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 14, fontFamily: fontFamilies.pretendardSemiBold },
});
