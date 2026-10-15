import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import GoalIcon from '@/assets/figma/main/605b2.svg';
import DietIcon from '@/assets/figma/main/2c97f.svg';
import ExerciseIcon from '@/assets/figma/main/0360a.svg';
import Down from '@/assets/figma/main/0369c.svg';
import { getHome, type HomeResponse } from '@/src/api/home';
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
import {
  MainGradient,
  MainHeader,
  MainScreen,
  mainStyles,
} from '@/src/components/main/MainSurface';
import { colors, fontFamilies } from '@/src/theme';

export default function TotalAnalysisScreen() {
  const router = useRouter();
  const compact = useWindowDimensions().width < 370;
  const [data, setData] = useState<AnalysisDisplayData | null>(null);
  const [home, setHome] = useState<HomeResponse | null>(null);
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
  const openReference = (id: string) => {
    const reference = data?.references.find((r) => r.id === id);
    if (reference) setSheet({ type: 'reference', reference });
  };
  return (
    <>
      <MainScreen tabs={false}>
        <MainHeader
          title="종합 건강 분석"
          height={220}
          back={() => router.back()}
          style={{ borderBottomLeftRadius: 50, borderBottomRightRadius: 50 }}
        >
          <View style={s.scoreRow}>
            <View style={{ flex: 1, gap: 14 }}>
              <Text style={[s.score, compact && { fontSize: 32 }]}>
                {score ?? '—'}점{' '}
                <Text style={s.delta}>
                  {delta != null ? `${delta > 0 ? '+' : ''}${delta}점` : ''}
                </Text>
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/tier')}>
                <Text style={s.pending}>티어 산정 준비 중 ›</Text>
              </Pressable>
              <View style={s.barRow}>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${ratio}%` }]} />
                </View>
                <Text style={s.total}>{total ?? '—'}</Text>
              </View>
            </View>
            <Image
              source={require('@/assets/figma/main/34a55.png')}
              resizeMode="contain"
              style={[s.medal, compact && { width: 100 }]}
            />
          </View>
        </MainHeader>
        <View style={s.content}>
          {state !== 'ready' || !data ? (
            <View style={[mainStyles.card, mainStyles.empty]}>
              <Text style={mainStyles.emptyTitle}>
                {state === 'loading'
                  ? '건강 분석을 불러오는 중이에요.'
                  : state === 'empty'
                    ? '아직 건강 분석 결과가 없어요.'
                    : error}
              </Text>
              {state === 'empty' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/upload')}
                  style={mainStyles.button}
                >
                  <Text style={mainStyles.buttonText}>건강 데이터 업로드</Text>
                </Pressable>
              ) : state === 'error' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAttempt((v) => v + 1)}
                  style={mainStyles.button}
                >
                  <Text style={mainStyles.buttonText}>다시 시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <View style={[mainStyles.card, s.goal]}>
                <View style={s.icon}>
                  <GoalIcon />
                </View>
                <View style={s.goalCopy}>
                  <Text style={s.goalLabel}>내 건강 목표</Text>
                  <Text style={s.heading}>{data.goal || '건강 목표를 설정해 주세요.'}</Text>
                </View>
              </View>
              <View style={s.strategy}>
                <MainGradient top="#44416F" bottom={colors.dark} />
                <Text style={s.strategyLabel}>✦ Auto-Fit 맞춤 제안</Text>
                <Text style={s.strategyTitle}>{data.strategy.title}</Text>
                <Text style={s.strategyMessage}>{data.strategy.message}</Text>
                {data.strategy.tags.length > 0 ? (
                  <Text style={s.strategyMessage}>{data.strategy.tags.join(' · ')}</Text>
                ) : null}
                <View style={[s.managementRow, compact && s.managementRowCompact]}>
                  {(
                    [
                      {
                        path: '/diet',
                        title: '식단 관리',
                        description: '오늘의 맞춤 식단 확인',
                        Icon: DietIcon,
                      },
                      {
                        path: '/exercise',
                        title: '운동 관리',
                        description: '맞춤 운동 루틴 확인',
                        Icon: ExerciseIcon,
                      },
                    ] as const
                  ).map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      key={item.path}
                      onPress={() => router.push(item.path)}
                      style={[s.management, compact && s.managementCompact]}
                    >
                      <View style={s.managementHeading}>
                        <item.Icon />
                        <Text style={s.tag}>{item.title}</Text>
                      </View>
                      <Text style={s.managementText}>{item.description} ›</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={[mainStyles.card, { gap: 14, borderRadius: 20 }]}>
                <Text style={s.heading}>건강 점수 변화</Text>
                <Text style={mainStyles.text}>
                  {home?.score_change.message || '이전 분석과 비교할 점수 변화가 아직 없어요.'}
                </Text>
                <View style={s.change}>
                  <Text style={s.changeLabel}>이전 평가 대비</Text>
                  <Text style={s.changeValue}>
                    {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}점`}
                  </Text>
                </View>
                <Text style={s.hint}>지표별 점수 기여도는 산정 기준이 확정되면 표시해요.</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpanded((v) => !v)}
                  style={s.expand}
                >
                  <Text style={mainStyles.text}>분석 지표 자세히 보기</Text>
                  <Down />
                </Pressable>
                {expanded ? (
                  <View style={{ gap: 14 }}>
                    {data.keyMetrics.length === 0 ? (
                      <Text style={mainStyles.text}>분석 지표가 아직 없어요.</Text>
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
                          <Text style={s.metricTitle}>{metric.name}</Text>
                          <Text style={s.metricValue}>
                            {metric.value} {metric.unit}
                          </Text>
                          <Text style={mainStyles.text}>{metric.status} ›</Text>
                        </Pressable>
                      ))
                    )}
                    <Text style={mainStyles.text}>{data.summary.description}</Text>
                    {data.reasons.map((reason) => (
                      <Pressable
                        accessibilityRole="button"
                        key={reason.id}
                        onPress={() => setSheet({ type: 'additional', reason })}
                        style={s.reason}
                      >
                        <Text style={s.metricTitle}>{reason.title} ›</Text>
                        <Text style={mainStyles.text}>{reason.description}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={[mainStyles.card, { gap: 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: sources }}
                  onPress={() => setSources((v) => !v)}
                  style={s.expand}
                >
                  <Text style={s.heading}>분석 기준 및 출처</Text>
                  <Down />
                </Pressable>
                {sources ? (
                  <>
                    <Text style={mainStyles.text}>
                      분석 결과는 건강 관리 참고 정보이며, 의학적 진단을 대신하지 않아요.
                    </Text>
                    {data.metricCriteria.map((criterion) => (
                      <Pressable
                        accessibilityRole="button"
                        key={criterion.id}
                        onPress={() => setSheet({ type: 'criterion', criterion })}
                        style={s.reason}
                      >
                        <Text style={s.metricTitle}>{criterion.metricName} 판정 기준 ›</Text>
                      </Pressable>
                    ))}
                    {data.references.map((reference) => (
                      <Pressable
                        accessibilityRole="button"
                        key={reference.id}
                        onPress={() => openReference(reference.id)}
                        style={s.reason}
                      >
                        <Text style={mainStyles.text}>{reference.title} ›</Text>
                      </Pressable>
                    ))}
                    {data.references.length === 0 ? (
                      <Text style={mainStyles.text}>등록된 출처가 없어요.</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/start-move')}
                style={mainStyles.button}
              >
                <Text style={mainStyles.buttonText}>건강 관리 시작하기</Text>
              </Pressable>
            </>
          )}
        </View>
      </MainScreen>
      <TotalAnalysisBottomSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        onOpenReference={openReference}
      />
    </>
  );
}
const s = StyleSheet.create({
  content: { alignSelf: 'stretch', marginHorizontal: 16, marginTop: 25, gap: 25 },
  scoreRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  score: { fontFamily: fontFamilies.pretendardBold, fontSize: 38, color: colors.textWhite },
  delta: { fontSize: 16, color: colors.primaryMedium },
  pending: {
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    color: colors.primaryMedium,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 10, backgroundColor: '#525157', borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.primaryMedium, borderRadius: 5 },
  total: { color: colors.textWhite, fontSize: 14 },
  medal: { width: 135, height: 130 },
  goal: { borderRadius: 50, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 74 },
  goalCopy: { flex: 1, flexShrink: 1, gap: 5, minWidth: 0 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalLabel: { fontFamily: fontFamilies.pretendardBold, fontSize: 18, color: colors.primary },
  heading: {
    color: colors.textBody,
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
  },
  strategy: {
    alignSelf: 'stretch',
    backgroundColor: colors.dark,
    borderRadius: 20,
    gap: 12,
    minWidth: 0,
    overflow: 'hidden',
    padding: 16,
  },
  strategyLabel: {
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    color: colors.primaryMedium,
  },
  strategyTitle: {
    alignSelf: 'stretch',
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 22,
    lineHeight: 29,
    color: colors.textWhite,
  },
  strategyMessage: {
    alignSelf: 'stretch',
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryLight,
  },
  managementRow: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, minWidth: 0 },
  managementRowCompact: { flexDirection: 'column' },
  management: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    padding: 10,
    gap: 10,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: colors.primaryMedium,
    backgroundColor: 'rgba(186,177,255,0.25)',
  },
  managementCompact: { flexBasis: 'auto', width: '100%' },
  managementHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
    minWidth: 0,
  },
  tag: {
    flexShrink: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  managementText: {
    color: colors.textWhite,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  change: { backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 16, gap: 7 },
  changeLabel: { fontSize: 14, color: colors.primary },
  changeValue: { fontFamily: fontFamilies.pretendardBold, fontSize: 24, color: colors.primary },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  expand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 32,
  },
  metric: { paddingVertical: 10, borderBottomWidth: 0.5, borderColor: colors.border, gap: 5 },
  metricTitle: {
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    color: colors.textBody,
  },
  metricValue: { fontFamily: fontFamilies.pretendardBold, fontSize: 22, color: colors.primary },
  reason: { gap: 8, paddingVertical: 10 },
});
