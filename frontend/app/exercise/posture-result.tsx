import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { koreanDate } from '@/src/lib/koreanDate';
import CheckIcon from '@/assets/icons/ui/check.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getPostureResult, type PostureFinding, type PostureRepetition, type PostureResult } from '@/src/api/posture';
import { angleRow, secondsLabel } from '@/src/features/exercise/postureFlow';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

// The chosen rep's measured angles next to the allowed range: real numbers instead of a drawn figure.
function AngleCard({ rep }: { rep: PostureRepetition }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.angleCard}>
    <Text style={styles.angleCaption}>{rep.repetition_number}회째 · {secondsLabel(rep.keyframe_offset_ms)} 장면 · {rep.score}점</Text>
    {rep.angles.map((angle, index) => {
      const row = angleRow(angle);
      return <View key={angle.angle_code} style={[styles.angleLine, index > 0 && styles.angleDivider]}>
        <View style={{ flex: 1 }}><Text style={styles.angleLabel}>{row.label}</Text>{row.target ? <Text style={styles.angleTargetText}>{row.target}</Text> : null}</View>
        <View style={styles.angleValues}><Text style={styles.angleValue}>{row.value}</Text><Text style={[styles.angleStatus, row.off && styles.angleOff]}>{row.status}</Text></View>
      </View>;
    })}
  </View>;
}

function FindingCard({ finding, expanded, onToggle }: {
  finding: PostureFinding; expanded: boolean; onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return <View style={styles.findingCard}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.findingHeader}>
      <View style={{ flex: 1 }}><Text style={styles.findingTitle}>{finding.title}</Text>
        {finding.repetition_start != null && <Text style={styles.findingSub}>{finding.repetition_start}{finding.repetition_end && finding.repetition_end !== finding.repetition_start ? `~${finding.repetition_end}` : ''}회째</Text>}
      </View><View style={styles.toggle}>{expanded ? <MinusIcon color={colors.textBody} height={20} width={20} /> : <PlusIcon color={colors.textBody} height={20} width={20} />}</View>
    </Pressable>
    {expanded && <View style={styles.findingBody}>
      <Text style={styles.sectionLabel}>왜 그럴까요</Text><Text style={styles.bodyText}>{finding.explanation}</Text>
      {finding.guidance_steps.length > 0 && <><Text style={styles.sectionLabel}>이렇게 고쳐요</Text>
        {finding.guidance_steps.map((step) => <View key={step.sequence_order} style={styles.guidanceRow}>
          <View style={styles.guidanceNumber}><Text style={styles.guidanceNumberText}>{step.sequence_order}</Text></View>
          <Text style={[styles.bodyText, { flex: 1 }]}>{step.instruction}</Text>
        </View>)}</>}
    </View>}
  </View>;
}

export default function PostureResultScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
      // The lowest-scoring rep shows first: it is the one worth looking at.
      setResult(next); setSelectedId([...next.repetitions].sort((a, b) => a.score - b.score)[0]?.posture_repetition_id ?? null);
      setError(null); setLoading(false);
    }).catch(() => { if (active) { setError('분석 결과를 불러오지 못했습니다.'); setLoading(false); } });
    return () => { active = false; };
  }, [jobId]));

  const selected = useMemo(() => result?.repetitions.find((rep) => rep.posture_repetition_id === selectedId) ?? result?.repetitions[0], [result, selectedId]);
  const corrections = result?.findings.filter((finding) => finding.finding_type === 'correction') ?? [];
  const positives = result?.findings.filter((finding) => finding.finding_type === 'positive') ?? [];
  const toggle = (id: string) => setExpandedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const date = result?.assessment.assessed_at ? koreanDate(result.assessment.assessed_at) : '';

  return <View style={styles.screen}>
    <ScreenHeader onBack={() => router.back()} title="자세 점검 결과" />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {loading && <ActivityIndicator color={colors.primaryText} style={{ marginTop: 60 }} />}
      {error && <View style={styles.empty}><Text style={styles.emptyTitle}>결과를 표시할 수 없어요</Text><Text style={styles.bodyText}>{error}</Text><Pressable onPress={() => router.back()} style={styles.secondaryButton}><Text style={styles.buttonText}>돌아가기</Text></Pressable></View>}
      {result && <>
        <View style={styles.scoreCard}><View style={styles.scoreRow}><Text style={styles.score}>{result.assessment.overall_score}</Text><Text style={styles.scoreUnit}>점</Text></View>
          <Text style={styles.summary}>{result.assessment.summary}</Text>
          <View style={styles.chips}><Text style={styles.chip}>{date}</Text><Text style={styles.chip}>옆에서 {Math.round((result.job.capture_duration_ms ?? 0) / 1000)}초</Text><Text style={styles.chip}>{result.assessment.repetition_count}회 인식</Text></View>
        </View>
        <Text style={styles.sectionTitle}>회차별 자세</Text>
        <View style={styles.repRow}>{result.repetitions.map((rep) => <Pressable key={rep.posture_repetition_id} onPress={() => setSelectedId(rep.posture_repetition_id)} accessibilityRole="button" accessibilityState={{ selected: selected?.posture_repetition_id === rep.posture_repetition_id }} style={[styles.repButton, selected?.posture_repetition_id === rep.posture_repetition_id && styles.repSelected]}><Text style={[styles.repText, selected?.posture_repetition_id === rep.posture_repetition_id && styles.repSelectedText]}>{rep.repetition_number}회</Text></Pressable>)}</View>
        {selected && selected.angles.length > 0 && <AngleCard rep={selected} />}
        <View style={styles.chartCard}><View style={styles.chartHeading}><Text style={styles.findingTitle}>회차별 점수</Text><Text style={styles.findingSub}>점수가 낮은 회차를 확인해요</Text></View>
          <View style={styles.chart}>{result.repetitions.map((rep) => <View style={styles.barColumn} key={rep.posture_repetition_id}><View style={[styles.bar, { height: `${Math.max(8, rep.score)}%`, backgroundColor: result.assessment.passing_score != null && rep.score < result.assessment.passing_score ? '#B56C00' : '#222027' }]}><Text style={styles.barText}>{rep.score}</Text></View><Text style={styles.barLabel}>{rep.repetition_number}회</Text></View>)}</View>
          {result.assessment.passing_score != null && <Text style={styles.threshold}>기준 {result.assessment.passing_score}점</Text>}
        </View>
        {corrections.length > 0 && <><Text style={styles.sectionTitle}>고칠 점 {corrections.length}</Text>{corrections.map((finding) => <FindingCard key={finding.posture_finding_id} finding={finding} expanded={expandedIds.includes(finding.posture_finding_id)} onToggle={() => toggle(finding.posture_finding_id)} />)}</>}
        {positives.length > 0 && <View style={styles.positiveCard}><Text style={styles.findingTitle}>잘한 점</Text>{positives.map((finding) => <View key={finding.posture_finding_id} style={styles.positiveRow}><CheckIcon color={colors.success} height={16} width={16} style={styles.positiveIcon} /><Text style={styles.positiveText}>{finding.title}</Text></View>)}</View>}
        <Text style={styles.privacy}>카메라 한 대로 본 결과라 참고용이에요. 영상은 분석 뒤 서버에서 지웠고, 관절 위치와 결과만 남아요.</Text>
        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/exercise/posture-capture', params: { exerciseCode: result.job.exercise_code, cameraView: result.job.camera_view } })} style={styles.secondaryButton}><Text style={styles.buttonText}>다시 찍기</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primaryButton}><Text style={styles.primaryText}>완료</Text></Pressable></View>
      </>}
    </ScrollView>
  </View>;
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20 }, empty: { marginTop: 40 }, emptyTitle: { fontSize: 18, fontFamily: fontFamilies.pretendardBold, marginBottom: 12 },
    scoreCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginTop: 8 },
    scoreRow: { flexDirection: 'row', alignItems: 'baseline' }, score: { fontSize: 32, fontFamily: fontFamilies.pretendardBold, color: colors.textPrimary }, scoreUnit: { fontSize: 16, marginLeft: 7, color: colors.textBody },
    summary: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.textBody, fontSize: 12, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.surface },
    sectionTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, marginTop: 25, marginBottom: 11 },
    skeletonBox: { height: 202, backgroundColor: '#1B1E21', borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, skeletonFloor: { position: 'absolute', bottom: 13, width: '100%', height: 2, backgroundColor: '#4D5255' }, noPoints: { color: '#FFFFFF', fontSize: 12 },
    angleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, angleChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.successLight }, angleText: { color: '#16885A', fontSize: 12 }, angleTarget: { color: colors.success, fontSize: 12, marginTop: 2 },
    angleCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, marginTop: 12 },
    angleCaption: { color: colors.textSecondary, fontSize: 13 },
    angleLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }, angleDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    angleLabel: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium }, angleTargetText: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    angleValues: { alignItems: 'flex-end' }, angleValue: { color: colors.textPrimary, fontSize: 18, fontFamily: fontFamilies.pretendardBold },
    angleStatus: { color: colors.textSecondary, fontSize: 12, marginTop: 2 }, angleOff: { color: colors.warning, fontFamily: fontFamilies.pretendardMedium },
    repRow: { flexDirection: 'row', gap: 6, marginTop: 12 }, repButton: { flex: 1, minHeight: 39, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, repSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, repText: { color: colors.textPrimary, fontSize: 12 }, repSelectedText: { color: colors.primaryText, fontFamily: fontFamilies.pretendardBold },
    chartCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginTop: 19, backgroundColor: colors.surface }, chartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    chart: { height: 145, flexDirection: 'row', gap: 10, alignItems: 'flex-end', justifyContent: 'center', marginTop: 19 }, barColumn: { flex: 1, height: 140, alignItems: 'center', justifyContent: 'flex-end' }, bar: { width: '60%', minWidth: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 5 }, barText: { color: '#FFFFFF', fontSize: 12 }, barLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 5 }, threshold: { color: colors.textSecondary, fontSize: 12, textAlign: 'right', marginTop: 7 },
    findingCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, backgroundColor: colors.surface, marginBottom: 10 }, findingHeader: { flexDirection: 'row', alignItems: 'center' }, findingTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium }, findingSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 }, toggle: { alignItems: 'center', width: 26 },
    findingBody: { marginTop: 15 }, sectionLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 8 }, bodyText: { color: colors.textBody, fontSize: 14, lineHeight: 21 }, guidanceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }, guidanceNumber: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: 8 }, guidanceNumberText: { color: colors.textBody, fontSize: 12 },
    suggestion: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 12 }, suggestionStatus: { color: colors.primaryText, fontSize: 12, marginTop: 8 },
    positiveCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, backgroundColor: colors.surface, marginTop: 16 }, positiveRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6, marginTop: 9 }, positiveIcon: { marginTop: 3 }, positiveText: { color: colors.textBody, flex: 1, fontSize: 14, lineHeight: 21 },
    privacy: { color: colors.textSecondary, fontSize: 12, marginTop: 20, lineHeight: 17 }, actions: { flexDirection: 'row', gap: 8, marginTop: 27 },
    secondaryButton: { flex: 1, minHeight: 56, backgroundColor: colors.surfaceMuted, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
    primaryButton: { flex: 1, minHeight: 56, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 14, fontFamily: fontFamilies.pretendardMedium },
  } as const;
}
