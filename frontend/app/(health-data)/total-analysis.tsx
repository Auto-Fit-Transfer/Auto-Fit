import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretText } from '@/src/components/common/CaretText';
import CheckIcon from '@/assets/icons/ui/check.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { getHome, type HomeResponse } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import {
  getLatestHealthAnalysis,
  getHealthAssessmentPopups,
  getHealthAnalysisErrorMessage,
  isHealthAnalysisNotFound,
} from '@/src/api/healthAnalysis';
import {
  createAnalysisDisplayData,
  type AnalysisDisplayData,
} from '@/src/components/analysis/totalAnalysisData';
import {
  TotalAnalysisBottomSheet,
  type AnalysisSheetState,
} from '@/src/components/analysis/TotalAnalysisBottomSheet';
import { nextTierName, tierBadges } from '@/src/features/tier/tierBadges';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

export default function TotalAnalysisScreen() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AnalysisDisplayData | null>(null);
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [sources, setSources] = useState(false);
  const [sheet, setSheet] = useState<AnalysisSheetState>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setState('loading');
      setTier(null);
      void getHabitTierProgress().then(({ progress }) => {
        if (live) setTier(progress);
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
  const score = home?.health_score.score;
  const total = home?.health_score.total_score;
  const ratio =
    score != null && total != null && total > 0
      ? Math.max(0, Math.min(100, (score / total) * 100))
      : 0;
  const delta = home?.score_change.change;
  const Badge = tierBadges[tier?.tier_code ?? 'CORE'];
  const nextName = tier ? nextTierName(tier) : null;
  const openReference = (id: string) => {
    const reference = data?.references.find((r) => r.id === id);
    if (reference) setSheet({ type: 'reference', reference });
  };
  return (
    <>
      <View style={s.root}>
        <ScreenHeader onBack={() => router.back()} title="종합 건강 분석" />
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <View style={[s.card, s.scoreCard]}>
            <Text style={s.muted}>건강 점수</Text>
            <View style={s.scoreRow}>
              <Text style={s.score}>{score ?? '—'}<Text style={s.scoreTotal}>  / {total ?? '—'}</Text></Text>
              {delta ? (
                <View style={[s.pill, delta > 0 && s.pillGood]}>
                  {delta > 0 ? <CheckIcon color={colors.success} height={14} width={14} /> : null}
                  <Text style={[s.pillText, delta > 0 && s.pillGoodText]}>지난번보다 {delta > 0 ? '+' : ''}{delta}</Text>
                </View>
              ) : null}
            </View>
            <View style={s.track}><View style={[s.fill, { width: `${ratio}%` }]} /></View>
            <View style={s.tierRow}>
              <Badge height={44} width={44} />
              <View style={s.grow}>
                <Text style={s.rowTitle}>{tier ? `${tier.tier_name} ${tier.sublevel}` : '건강관리 티어'}</Text>
                {tier && nextName ? <Text style={s.muted}>다음 {nextName}까지 {Math.max(0, (tier.next_level_points ?? 0) - tier.points)}점</Text> : null}
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/tier')} style={s.smallButton}>
                <Text style={s.smallButtonText}>티어 보기</Text>
              </Pressable>
            </View>
            {home?.score_change.message ? <Text style={s.message}>{home.score_change.message}</Text> : null}
          </View>
          {state !== 'ready' || !data ? (
            <View style={[s.card, s.empty]}>
              <Text style={s.emptyTitle}>
                {state === 'loading'
                  ? '건강 분석을 불러오는 중이에요.'
                  : state === 'empty'
                    ? '아직 건강 분석 결과가 없어요.'
                    : error}
              </Text>
              {state === 'empty' ? (
                <Pressable accessibilityRole="button" onPress={() => router.push('/upload')} style={[s.smallButton, s.emptyButton]}>
                  <Text style={s.smallButtonText}>건강 데이터 올리기</Text>
                </Pressable>
              ) : state === 'error' ? (
                <Pressable accessibilityRole="button" onPress={() => setAttempt((v) => v + 1)} style={[s.smallButton, s.emptyButton]}>
                  <Text style={s.smallButtonText}>다시 시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <View style={[s.card, s.goal]}>
                <View style={s.icon}><TargetIcon color={colors.textPrimary} height={22} width={22} /></View>
                <View style={s.grow}>
                  <Text style={s.muted}>내 목표</Text>
                  <Text style={s.rowTitle}>{data.goal || '건강 목표를 설정해 주세요.'}</Text>
                </View>
              </View>
              <View style={[s.card, s.strategy]}>
                <Text style={s.muted}>맞춤 제안</Text>
                <Text style={s.strategyTitle}>{data.strategy.title}</Text>
                {data.strategy.tags.length > 0 ? (
                  <View style={s.tags}>
                    {data.strategy.tags.map((tag) => <Text key={tag} style={s.tag}>{tag}</Text>)}
                  </View>
                ) : null}
                <Text style={s.body}>{data.strategy.message}</Text>
                <View style={s.plans}>
                  {([
                    { path: '/diet', title: '식단', detail: '오늘의 맞춤 식단을 확인해요', action: '식단 보기' },
                    { path: '/exercise', title: '운동', detail: '맞춤 운동 루틴을 확인해요', action: '운동 보기' },
                  ] as const).map((item) => (
                    <View key={item.path} style={s.plan}>
                      <Text style={s.rowTitle}>{item.title}</Text>
                      <Text style={s.body}>{item.detail}</Text>
                      <Pressable accessibilityRole="button" onPress={() => router.push(item.path)} style={s.smallButton}>
                        <Text style={s.smallButtonText}>{item.action}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
              <View style={s.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpanded((v) => !v)}
                  style={s.expand}
                >
                  <View style={s.grow}>
                    <Text style={s.rowTitle}>{delta ? `점수가 바뀐 이유 · ${delta > 0 ? '+' : ''}${delta}점` : '분석 지표 자세히 보기'}</Text>
                    <Text numberOfLines={expanded ? undefined : 2} style={s.small}>{data.summary.description}</Text>
                  </View>
                  {expanded ? <MinusIcon color={colors.textPrimary} height={22} width={22} /> : <PlusIcon color={colors.textPrimary} height={22} width={22} />}
                </Pressable>
                {expanded ? (
                  <>
                    {data.keyMetrics.length === 0 ? (
                      <Text style={[s.body, s.expandedText]}>분석 지표가 아직 없어요.</Text>
                    ) : (
                      data.keyMetrics.map((metric) => (
                        <Pressable
                          accessibilityRole="button"
                          key={metric.id}
                          onPress={() => {
                            const criterion = data.metricCriteria.find((c) => c.id === metric.id);
                            if (criterion) setSheet({ type: 'criterion', criterion });
                          }}
                          style={s.metric}
                        >
                          <View style={s.grow}>
                            <Text style={s.rowTitle}>{metric.name}</Text>
                            <Text style={s.muted}>{metric.value} {metric.unit}</Text>
                          </View>
                          <View style={[s.pill, metric.tone === 'normal' ? s.pillGood : s.pillWarn]}>
                            {metric.tone === 'normal' ? <CheckIcon color={colors.success} height={14} width={14} /> : <WarningIcon color={colors.warning} height={14} width={14} />}
                            <Text style={[s.pillText, metric.tone === 'normal' ? s.pillGoodText : s.pillWarnText]}>{metric.status}</Text>
                          </View>
                        </Pressable>
                      ))
                    )}
                    {data.reasons.map((reason) => (
                      <Pressable
                        accessibilityRole="button"
                        key={reason.id}
                        onPress={() => setSheet({ type: 'additional', reason })}
                        style={s.reason}
                      >
                        <Text style={s.rowTitle}>{reason.title}</Text>
                        <Text style={s.body}>{reason.description}</Text>
                      </Pressable>
                    ))}
                  </>
                ) : null}
              </View>
              <View style={s.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: sources }}
                  onPress={() => setSources((v) => !v)}
                  style={s.expand}
                >
                  <Text style={[s.rowTitle, s.grow]}>분석 기준과 출처</Text>
                  {sources ? <MinusIcon color={colors.textPrimary} height={22} width={22} /> : <PlusIcon color={colors.textPrimary} height={22} width={22} />}
                </Pressable>
                {sources ? (
                  <>
                    <Text style={[s.body, s.expandedText]}>
                      분석 결과는 건강 관리 참고 정보이며, 의학적 진단을 대신하지 않아요.
                    </Text>
                    {data.metricCriteria.map((criterion) => (
                      <Pressable
                        accessibilityRole="button"
                        key={criterion.id}
                        onPress={() => setSheet({ type: 'criterion', criterion })}
                        style={s.reason}
                      >
                        <CaretText style={s.body}>{criterion.metricName} 판정 기준</CaretText>
                      </Pressable>
                    ))}
                    {data.references.map((reference) => (
                      <Pressable
                        accessibilityRole="button"
                        key={reference.id}
                        onPress={() => openReference(reference.id)}
                        style={s.reason}
                      >
                        <CaretText style={s.body}>{reference.title}</CaretText>
                      </Pressable>
                    ))}
                    {data.references.length === 0 ? (
                      <Text style={[s.body, s.expandedText]}>등록된 출처가 없어요.</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/exercise')} style={s.primary}>
                <Text style={s.primaryText}>운동하러 가기</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
      <TotalAnalysisBottomSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        onOpenReference={openReference}
      />
    </>
  );
}
function createSStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: colors.background },
    content: { gap: 16, paddingHorizontal: 20, paddingTop: 8 },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    grow: { flex: 1, minWidth: 0 },
    muted: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    small: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    body: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    rowTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    scoreCard: { gap: 10, padding: 18 },
    scoreRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
    score: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 32, lineHeight: 42 },
    scoreTotal: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 16 },
    pill: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 999, flexDirection: 'row', gap: 4, height: 26, paddingHorizontal: 10 },
    pillText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    pillGood: { backgroundColor: colors.successLight },
    pillGoodText: { color: colors.success },
    pillWarn: { backgroundColor: colors.warningLight },
    pillWarnText: { color: colors.warning },
    track: { backgroundColor: colors.gaugeTrack, borderRadius: 4, height: 8, overflow: 'hidden' },
    fill: { backgroundColor: colors.tabBar, borderRadius: 4, height: 8 },
    tierRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 4 },
    message: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21, marginTop: 4, paddingTop: 12 },
    smallButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: 12 },
    smallButtonText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    empty: { alignItems: 'center', gap: 12, padding: 24 },
    emptyButton: { alignSelf: 'center' },
    emptyTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 16, lineHeight: 24, textAlign: 'center' },
    goal: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 75, paddingHorizontal: 16, paddingVertical: 10 },
    icon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    strategy: { gap: 8, padding: 18 },
    strategyTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
    plans: { flexDirection: 'row', gap: 8, marginTop: 4 },
    plan: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, gap: 6, minWidth: 0, padding: 12 },
    expand: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64, padding: 16 },
    expandedText: { paddingBottom: 12, paddingHorizontal: 16 },
    metric: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 8, minHeight: 72, paddingHorizontal: 16, paddingVertical: 8 },
    reason: { borderTopColor: colors.border, borderTopWidth: 1, gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
    primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center' },
    primaryText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  } as const;
}
