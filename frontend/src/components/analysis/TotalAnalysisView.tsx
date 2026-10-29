import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import CaretDownIcon from '@/assets/icons/ui/caret-down.svg';
import MinusIcon from '@/assets/icons/ui/minus.svg';
import PlusIcon from '@/assets/icons/ui/plus.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import {
  AppButton,
  Badge,
  IconButton,
  ProgressBar,
  Text,
  type BadgeTone,
} from '@/src/components/common';
import { SubScreen } from '@/src/components/navigation';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { TotalAnalysisBottomSheet, type AnalysisSheetState } from './TotalAnalysisBottomSheet';
import type { AnalysisDisplayData, AnalysisTone } from './totalAnalysisData';

const badgeTone: Record<AnalysisTone, BadgeTone> = {
  normal: 'good',
  warning: 'caution',
  danger: 'danger',
};

function deltaLabel(delta: number) {
  if (delta === 0) return '지난번과 같아요';
  return `지난번보다 ${delta > 0 ? '+' : ''}${delta}`;
}

export interface TotalAnalysisViewProps {
  health: {
    score: number | null;
    total: number | null;
    change: number | null;
    message: string;
  } | null;
  data: AnalysisDisplayData | null;
  state: 'loading' | 'ready' | 'empty' | 'error';
  error: string;
  onBack: () => void;
  onRetry: () => void;
  onUpload: () => void;
  onOpenTier: () => void;
  onOpenDiet: () => void;
  onOpenExercise: () => void;
  onGoExercise: () => void;
}

// Figma B6. The four-week bars, the tier level and the per-item score changes wait for server
// data; the start screen (Start_Move) is now the button at the bottom.
export function TotalAnalysisView({
  health,
  data,
  state,
  error,
  onBack,
  onRetry,
  onUpload,
  onOpenTier,
  onOpenDiet,
  onOpenExercise,
  onGoExercise,
}: TotalAnalysisViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sheet, setSheet] = useState<AnalysisSheetState>(null);

  const score = health?.score;
  const total = health?.total;
  const ratio = score != null && total != null && total > 0 ? score / total : 0;
  const delta = health?.change;

  const openReference = (id: string) => {
    const reference = data?.references.find((item) => item.id === id);
    if (reference) setSheet({ type: 'reference', reference });
  };
  const openCriterion = (id: string) => {
    const criterion = data?.metricCriteria.find((item) => item.id === id);
    if (criterion) setSheet({ type: 'criterion', criterion });
  };

  return (
    <>
      <SubScreen
        footer={
          state === 'ready' ? <AppButton onPress={onGoExercise} title="운동하러 가기" /> : undefined
        }
        gap={16}
        onBack={onBack}
        title="종합 건강 분석"
      >
        <Card>
          <Text style={styles.caption}>건강 점수</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>
              {score ?? '—'}
              <Text style={styles.scoreTotal}> / {total ?? 100}</Text>
            </Text>
            {delta != null ? (
              <Badge
                label={deltaLabel(delta)}
                showIcon={delta > 0}
                tone={delta > 0 ? 'good' : 'neutral'}
              />
            ) : null}
          </View>
          <ProgressBar value={ratio} />
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.strong}>티어</Text>
              <Text style={styles.caption}>티어 산정을 준비하고 있어요</Text>
            </View>
            <AppButton
              fullWidth={false}
              onPress={onOpenTier}
              size="S"
              title="티어 보기"
              variant="outline"
            />
          </View>
          {health?.message ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.body}>{health.message}</Text>
            </>
          ) : null}
        </Card>

        {state !== 'ready' || !data ? (
          <Card style={styles.statusCard}>
            {state === 'loading' ? <ActivityIndicator color={colors.textSecondary} /> : null}
            <Text style={styles.strong}>
              {state === 'loading'
                ? '건강 분석을 불러오는 중이에요'
                : state === 'empty'
                  ? '아직 건강 분석 결과가 없어요'
                  : error}
            </Text>
            {state === 'empty' ? (
              <>
                <Text style={styles.caption}>
                  건강검진이나 인바디 결과지를 올리면 분석해 드려요.
                </Text>
                <AppButton
                  fullWidth={false}
                  onPress={onUpload}
                  size="M"
                  title="자료 올리기"
                  variant="outline"
                />
              </>
            ) : state === 'error' ? (
              <AppButton
                fullWidth={false}
                onPress={onRetry}
                size="M"
                title="다시 시도"
                variant="outline"
              />
            ) : null}
          </Card>
        ) : (
          <>
            <Card style={styles.row}>
              <View style={styles.iconCircle}>
                <TargetIcon color={colors.textPrimary} height={18} width={18} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.caption}>내 목표</Text>
                <Text style={styles.strong}>{data.goal || '목표를 정해 주세요'}</Text>
              </View>
            </Card>

            <Card>
              <Text style={styles.caption}>맞춤 제안</Text>
              <Text style={styles.suggestionTitle}>{data.strategy.title}</Text>
              {data.strategy.tags.length > 0 ? (
                <View style={styles.tags}>
                  {data.strategy.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {data.strategy.message ? (
                <Text style={styles.body}>{data.strategy.message}</Text>
              ) : null}
              <View style={styles.buttonRow}>
                <AppButton
                  fullWidth={false}
                  onPress={onOpenDiet}
                  size="S"
                  style={styles.flex}
                  title="식단 보기"
                  variant="outline"
                />
                <AppButton
                  fullWidth={false}
                  onPress={onOpenExercise}
                  size="S"
                  style={styles.flex}
                  title="운동 보기"
                  variant="outline"
                />
              </View>
            </Card>

            <Card>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.strong}>분석에 쓴 수치</Text>
                  <Text style={styles.caption}>
                    {data.keyMetrics.length > 0
                      ? data.keyMetrics.map((metric) => metric.name).join(' · ')
                      : '아직 분석에 쓴 수치가 없어요'}
                  </Text>
                </View>
                <IconButton
                  accessibilityLabel={metricsOpen ? '수치 접기' : '수치 펼치기'}
                  icon={
                    metricsOpen ? (
                      <MinusIcon color={colors.textPrimary} height={20} width={20} />
                    ) : (
                      <PlusIcon color={colors.textPrimary} height={20} width={20} />
                    )
                  }
                  onPress={() => setMetricsOpen((open) => !open)}
                  size={40}
                  surface
                />
              </View>
              {metricsOpen ? (
                <View style={styles.openList}>
                  {data.summary.description ? (
                    <Text style={styles.body}>{data.summary.description}</Text>
                  ) : null}
                  {data.keyMetrics.map((metric) => (
                    <Pressable
                      key={metric.id}
                      accessibilityRole="button"
                      onPress={() => openCriterion(metric.id)}
                      style={({ pressed }) => [styles.metricRow, pressed && styles.pressed]}
                    >
                      <View style={styles.flex}>
                        <Text style={styles.metricName}>{metric.name}</Text>
                        <Text style={styles.caption}>
                          {metric.value}
                          {metric.unit ? ` ${metric.unit}` : ''}
                        </Text>
                      </View>
                      <Badge label={metric.status} tone={badgeTone[metric.tone]} />
                    </Pressable>
                  ))}
                  {data.reasons.length > 0 ? (
                    <Text style={styles.subheading}>이렇게 제안한 이유</Text>
                  ) : null}
                  {data.reasons.map((reason) => (
                    <Pressable
                      key={reason.id}
                      accessibilityRole="button"
                      onPress={() => setSheet({ type: 'additional', reason })}
                      style={({ pressed }) => [styles.reasonRow, pressed && styles.pressed]}
                    >
                      <Text style={styles.strong}>{reason.title}</Text>
                      <Text style={styles.caption}>{reason.description}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>

            <Card>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: sourcesOpen }}
                onPress={() => setSourcesOpen((open) => !open)}
                style={styles.row}
              >
                <Text style={[styles.strong, styles.flex]}>분석 기준과 출처</Text>
                <CaretDownIcon
                  color={colors.textSecondary}
                  height={18}
                  style={sourcesOpen ? styles.caretOpen : undefined}
                  width={18}
                />
              </Pressable>
              {sourcesOpen ? (
                <View style={styles.openList}>
                  {data.metricCriteria.map((criterion) => (
                    <SourceRow key={criterion.id} onPress={() => openCriterion(criterion.id)}>
                      {criterion.metricName} 판정 기준
                    </SourceRow>
                  ))}
                  {data.references.map((reference) => (
                    <SourceRow key={reference.id} onPress={() => openReference(reference.id)}>
                      {reference.title}
                    </SourceRow>
                  ))}
                  {data.references.length === 0 ? (
                    <Text style={styles.caption}>등록된 출처가 없어요.</Text>
                  ) : null}
                </View>
              ) : null}
            </Card>
            <Text style={styles.disclaimer}>
              분석 결과는 건강 관리 참고 정보이며, 의학적 진단을 대신하지 않아요.
            </Text>
          </>
        )}
      </SubScreen>
      <TotalAnalysisBottomSheet
        onClose={() => setSheet(null)}
        onOpenReference={openReference}
        sheet={sheet}
      />
    </>
  );
}

function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

function SourceRow({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}
    >
      <Text style={styles.body}>{children}</Text>
    </Pressable>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1 },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: 12,
      padding: 20,
    },
    statusCard: { alignItems: 'center', paddingVertical: 32 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    caption: { ...text.caption, color: colors.textSecondary },
    body: { ...text.body2, color: colors.textBody },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    scoreRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'space-between',
      marginTop: -8,
    },
    score: { ...text.display, color: colors.textPrimary },
    scoreTotal: { ...text.body1, color: colors.textSecondary },
    divider: { backgroundColor: colors.border, height: 1 },
    iconCircle: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    suggestionTitle: { ...text.title2, color: colors.textPrimary, marginTop: -4 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagText: { ...text.caption, color: colors.textBody },
    buttonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    openList: { gap: 8, marginTop: 4 },
    metricRow: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    metricName: { ...text.body1Strong, color: colors.textPrimary },
    subheading: { ...text.body2Strong, color: colors.textPrimary, marginTop: 8 },
    reasonRow: { gap: 2, paddingVertical: 6 },
    sourceRow: { paddingVertical: 8 },
    caretOpen: { transform: [{ rotate: '180deg' }] },
    disclaimer: { ...text.caption, color: colors.textSecondary, paddingHorizontal: 4 },
    pressed: { opacity: 0.75 },
  } as const;
}
