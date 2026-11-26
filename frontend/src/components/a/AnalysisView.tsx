import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/ui/check.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import type { AnalysisDisplayData, AnalysisReason, MetricCriterion } from '@/src/components/analysis/totalAnalysisData';
import type { ScoreCard } from '@/src/features/healthScore';
import { Text } from '@/src/components/common';
import { CaretText } from '@/src/components/common/CaretText';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { aForm } from './form';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';

// Renewal A's 종합 건강 분석: what the analysis says in one line by my character, my health score, my
// goal and what is suggested for it in one card, then the numbers behind it and their sources folded
// away, and the two ways on (식단, 운동) as one row of buttons. There is no design file for this screen;
// it follows the report's layout. A view that only shows what it is given.
export interface AnalysisViewProps {
  characterId: ChatCharacterId; // B: the chosen 물어보기 character says the lead line, as on the home and report
  card: ScoreCard | null; // null while it is read
  delta: number | null;
  message: string | null; // what the server says about the change in score
  tier: { name: string; stars: number; left: string | null } | null;
  state: 'loading' | 'ready' | 'empty' | 'error';
  error: string;
  data: AnalysisDisplayData | null;
  onBack: () => void;
  onTier: () => void;
  onUpload: () => void;
  onDocs: () => void;
  onRetry: () => void;
  onDiet: () => void;
  onExercise: () => void;
  onCriterion: (criterion: MetricCriterion) => void;
  onReason: (reason: AnalysisReason) => void;
  onReference: (id: string) => void;
}

export function AnalysisView(props: AnalysisViewProps) {
  const { characterId, card, message, tier, state, error, data } = props;
  // only a finished overall score has a change, a bar and a tier beside it (back-end d5b96a9a)
  const overall = card?.kind === 'overall';
  const score = card?.kind === 'overall' || card?.kind === 'partial' ? card.score : null;
  const total = card?.kind === 'overall' ? card.total : card?.kind === 'partial' ? 100 : null;
  const delta = overall ? props.delta : null;
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [sources, setSources] = useState(false);
  const ratio = score != null && total != null && total > 0 ? Math.max(0, Math.min(100, (score / total) * 100)) : 0;
  const say = data?.headline || message;
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;
  const fold = (open: boolean) => (open ? <MinusIcon color={colors.textPrimary} height={22} width={22} /> : <PlusIcon color={colors.textPrimary} height={22} width={22} />);

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={props.onBack} title="종합 건강 분석" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        {say ? (
          <View style={styles.ask}>
            <View style={styles.face}>
              <ChatCharacterAvatar characterId={characterId} size={26} />
            </View>
            <View style={styles.say}>
              <Text style={styles.strong}>{say}</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.card, styles.scoreCard]}>
          <Text style={styles.note}>{card && card.kind !== 'overall' && card.kind !== 'none' ? '건강 데이터 점수' : '건강 점수'}</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>
              {score ?? '—'}
              <Text style={styles.scoreTotal}>  / {total ?? '—'}</Text>
            </Text>
            {delta ? (
              <View style={[styles.pill, delta > 0 && styles.pillGood]}>
                <Text style={styles.pillText}>지난번보다 {signed(delta)}</Text>
              </View>
            ) : null}
          </View>
          {card?.kind === 'partial' ? <Text style={styles.body}>검진표 · 인바디로 낸 점수예요. 종합 점수는 일주일 식단 · 운동 기록이 모이면 나와요.</Text> : null}
          {card?.kind === 'check' || card?.kind === 'failed' ? (
            <View style={styles.tierRow}>
              <Text style={[styles.body, styles.grow]}>{card.kind === 'check' ? '측정 수치를 확인해 주세요.' : '점수를 불러오지 못했어요.'}</Text>
              <Pressable accessibilityRole="button" hitSlop={6} onPress={card.kind === 'check' ? props.onDocs : props.onRetry} style={({ pressed }) => [styles.mini, pressed && styles.sunk]}>
                <Text style={styles.miniText}>{card.kind === 'check' ? '건강 서류 보기' : '다시 시도'}</Text>
              </Pressable>
            </View>
          ) : null}
          {overall || card?.kind === 'none' ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${ratio}%` }]} />
          </View>
          ) : null}
          {overall && message && message !== say ? <Text style={styles.body}>{message}</Text> : null}
          {overall || card?.kind === 'none' ? (
          <View style={styles.tierRow}>
            <View style={styles.grow}>
              <Text style={styles.strong}>
                {tier ? tier.name : '건강관리 티어'}
                {tier ? (
                  <Text style={styles.stars}>
                    {'  '}
                    {[1, 2, 3].map((star) => (
                      <Text key={star} style={{ color: star <= tier.stars ? colors.textPrimary : colors.surfaceMuted }}>
                        ★
                      </Text>
                    ))}
                  </Text>
                ) : null}
              </Text>
              {tier?.left ? <Text style={styles.note}>{tier.left}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" hitSlop={6} onPress={props.onTier} style={({ pressed }) => [styles.mini, pressed && styles.sunk]}>
              <Text style={styles.miniText}>티어 보기</Text>
            </Pressable>
          </View>
          ) : null}
        </View>

        {state !== 'ready' || !data ? (
          <View style={[styles.card, styles.empty]}>
            <Text style={[styles.strong, styles.center]}>
              {state === 'loading' ? '건강 분석을 불러오는 중이에요.' : state === 'empty' ? '아직 건강 분석 결과가 없어요.' : error}
            </Text>
            {state === 'empty' || state === 'error' ? (
              <Pressable accessibilityRole="button" onPress={state === 'empty' ? props.onUpload : props.onRetry} style={({ pressed }) => [styles.mini, pressed && styles.sunk]}>
                <Text style={styles.miniText}>{state === 'empty' ? '건강 데이터 올리기' : '다시 시도'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View style={[styles.card, styles.plan]}>
              <Text style={styles.eyebrow}>내 목표</Text>
              <Text style={styles.strong}>{data.goal || '건강 목표를 설정해 주세요.'}</Text>
              <View style={styles.rule} />
              <Text style={styles.eyebrow}>맞춤 제안</Text>
              <Text style={styles.title}>{data.strategy.title}</Text>
              {data.strategy.tags.length > 0 ? (
                <View style={styles.tags}>
                  {data.strategy.tags.map((tag) => (
                    <Text key={tag} style={styles.tag}>
                      {tag}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.body}>{data.strategy.message}</Text>
            </View>

            <View style={styles.card}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((open) => !open)} style={styles.expand}>
                <View style={styles.grow}>
                  <Text style={styles.strong}>{delta ? `점수가 바뀐 이유 · ${signed(delta)}점` : '분석 지표 자세히 보기'}</Text>
                  <Text numberOfLines={expanded ? undefined : 2} style={styles.note}>
                    {data.summary.description}
                  </Text>
                </View>
                {fold(expanded)}
              </Pressable>
              {expanded ? (
                <>
                  {data.keyMetrics.length === 0 ? <Text style={[styles.body, styles.inside]}>분석 지표가 아직 없어요.</Text> : null}
                  {data.keyMetrics.map((metric) => {
                    const criterion = data.metricCriteria.find((item) => item.id === metric.id);
                    return (
                      <Pressable accessibilityRole="button" disabled={!criterion} key={metric.id} onPress={() => (criterion ? props.onCriterion(criterion) : undefined)} style={styles.metric}>
                        <View style={styles.grow}>
                          <Text style={styles.strong}>{metric.name}</Text>
                          <Text style={styles.note}>
                            {metric.value} {metric.unit}
                          </Text>
                        </View>
                        <View style={[styles.pill, metric.tone === 'normal' ? styles.pillGood : styles.pillWarn]}>
                          {metric.tone === 'normal' ? <CheckIcon color={colors.success} height={14} width={14} /> : <WarningIcon color={colors.warning} height={14} width={14} />}
                          <Text style={styles.pillText}>{metric.status}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  {data.reasons.map((reason) => (
                    <Pressable accessibilityRole="button" key={reason.id} onPress={() => props.onReason(reason)} style={styles.reason}>
                      <Text style={styles.strong}>{reason.title}</Text>
                      <Text style={styles.body}>{reason.description}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </View>

            <View style={styles.card}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: sources }} onPress={() => setSources((open) => !open)} style={styles.expand}>
                <Text style={[styles.strong, styles.grow]}>분석 기준과 출처</Text>
                {fold(sources)}
              </Pressable>
              {sources ? (
                <>
                  <Text style={[styles.body, styles.inside]}>분석 결과는 건강 관리 참고 정보이며, 의학적 진단을 대신하지 않아요.</Text>
                  {data.metricCriteria.map((criterion) => (
                    <Pressable accessibilityRole="button" key={criterion.id} onPress={() => props.onCriterion(criterion)} style={styles.reason}>
                      <CaretText style={styles.body}>{criterion.metricName} 판정 기준</CaretText>
                    </Pressable>
                  ))}
                  {data.references.map((reference) => (
                    <Pressable accessibilityRole="button" key={reference.id} onPress={() => props.onReference(reference.id)} style={styles.reason}>
                      <CaretText style={styles.body}>{reference.title}</CaretText>
                    </Pressable>
                  ))}
                  {data.references.length === 0 ? <Text style={[styles.body, styles.inside]}>등록된 출처가 없어요.</Text> : null}
                </>
              ) : null}
            </View>

            {/* The two ways on from here, once each. */}
            <View style={styles.two}>
              <Pressable accessibilityRole="button" onPress={props.onExercise} style={({ pressed }) => [styles.go, pressed && styles.goPressed]}>
                <Text style={styles.goText}>운동 보기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={props.onDiet} style={({ pressed }) => [styles.go, styles.goGhost, pressed && styles.goPressed]}>
                <Text style={[styles.goText, styles.ink]}>식단 보기</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const outline = { borderWidth: 1 } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 4 },
    card: { ...a.card, overflow: 'hidden' },
    grow: { flex: 1, minWidth: 0 },
    note: a.note,
    body: { ...a.p15, color: colors.textBody },
    strong: { ...a.p15, color: colors.textPrimary },
    ink: { color: colors.textPrimary },
    center: { textAlign: 'center' },
    eyebrow: { ...a.p12, color: colors.primaryText },
    sunk: { transform: [{ translateY: 3 }] },

    ask: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    face: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
    say: { backgroundColor: colors.surface, borderRadius: 18, flex: 1, paddingHorizontal: 16, paddingVertical: 12 },

    scoreCard: { gap: 10, padding: 16 },
    scoreRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
    score: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 36, lineHeight: 42 },
    scoreTotal: { ...a.p15, color: colors.textSecondary },
    pill: { ...outline, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 99, flexDirection: 'row', gap: 4, height: 26, paddingHorizontal: 8 },
    pillText: { ...a.p12, color: colors.textPrimary },
    pillGood: { backgroundColor: colors.successLight },
    pillWarn: { backgroundColor: colors.warningLight },
    bar: { ...outline, backgroundColor: colors.surfaceMuted, borderRadius: 99, height: 16, overflow: 'hidden' },
    barFill: { backgroundColor: colors.primary, bottom: 0, left: 0, position: 'absolute', top: 0 },
    tierRow: { alignItems: 'center', borderTopColor: colors.surfaceMuted, borderTopWidth: 2, flexDirection: 'row', gap: 10, marginTop: 2, paddingTop: 12 },
    stars: { fontSize: 12, lineHeight: 15 },
    mini: { ...a.mini, marginBottom: 3 },
    miniText: a.miniText,

    empty: { alignItems: 'center', gap: 12, padding: 24 },

    // my goal, and what is suggested for it
    plan: { gap: 6, padding: 16 },
    rule: { backgroundColor: colors.surfaceMuted, height: 2, marginVertical: 8 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 22, lineHeight: 26 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: { ...a.p12, backgroundColor: colors.surfaceMuted, borderRadius: 99, color: colors.textPrimary, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },

    expand: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64, padding: 14 },
    inside: { paddingBottom: 12, paddingHorizontal: 14 },
    metric: { alignItems: 'center', borderTopColor: colors.surfaceMuted, borderTopWidth: 2, flexDirection: 'row', gap: 8, minHeight: 64, paddingHorizontal: 14, paddingVertical: 8 },
    reason: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2, gap: 4, paddingHorizontal: 14, paddingVertical: 12 },

    two: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    go: { ...a.go, flex: 1, height: 52 },
    goGhost: a.goGhost,
    goPressed: a.goPressed,
    goText: a.goText,
  } as const;
}
