import type { ReactNode } from 'react';
import { Alert, Linking, View } from 'react-native';

import { AppBottomSheet, AppButton, Badge, Text, type BadgeTone } from '@/src/components/common';
import { radius, useThemedStyles, type AppTheme } from '@/src/theme';

import type {
  AnalysisReason,
  AnalysisTone,
  MetricCriterion,
  ReferenceSource,
} from './totalAnalysisData';

export type AnalysisSheetState =
  | { type: 'additional'; reason: AnalysisReason }
  | { type: 'criterion'; criterion: MetricCriterion }
  | { type: 'reference'; reference: ReferenceSource }
  | null;

interface Props {
  sheet: AnalysisSheetState;
  onClose: () => void;
  onOpenReference: (referenceId: string) => void;
}

const badgeTone: Record<AnalysisTone, BadgeTone> = {
  normal: 'good',
  warning: 'caution',
  danger: 'danger',
};

async function openExternalUrl(url?: string) {
  if (!url) {
    Alert.alert('원문 링크 준비 중', '확정된 원문 주소가 아직 등록되지 않았어요.');
    return;
  }
  try {
    if (!(await Linking.canOpenURL(url))) throw new Error('unsupported-url');
    await Linking.openURL(url);
  } catch {
    Alert.alert('링크를 열 수 없어요', '잠시 후 다시 시도해 주세요.');
  }
}

function Box({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.box}>{children}</View>;
}

function AdditionalMetricsContent({ reason }: { reason: AnalysisReason }) {
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <Text style={styles.description}>{reason.sheetDescription}</Text>
      {reason.additionalMetrics.map((metric) => (
        <View key={metric.id} style={styles.metricRow}>
          <View style={styles.flex}>
            <Text style={styles.strong}>{metric.name}</Text>
            <Text style={styles.caption}>
              {metric.value}
              {metric.unit ? ` ${metric.unit}` : ''}
            </Text>
          </View>
          <Badge label={metric.status} tone={badgeTone[metric.tone]} />
        </View>
      ))}
      {reason.interpretation ? (
        <Box>
          <Text style={styles.strong}>해석 요약</Text>
          <Text style={styles.body}>{reason.interpretation}</Text>
        </Box>
      ) : null}
      <Text style={styles.caption}>지금 제안을 정할 때 함께 참고한 수치예요.</Text>
    </>
  );
}

function CriterionContent({
  criterion,
  onOpenReference,
}: {
  criterion: MetricCriterion;
  onOpenReference: (referenceId: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <Text style={styles.description}>
        지금 수치가 왜 &lsquo;{criterion.status}&rsquo;인지 보여 드려요.
      </Text>
      <Box>
        <View style={styles.currentRow}>
          <View style={styles.flex}>
            <Text style={styles.caption}>현재 수치</Text>
            <Text style={styles.currentValue}>
              {criterion.value}
              {criterion.unit ? <Text style={styles.body}> {criterion.unit}</Text> : null}
            </Text>
          </View>
          <View style={styles.currentJudge}>
            <Text style={styles.caption}>현재 판정</Text>
            <Badge label={criterion.status} tone={badgeTone[criterion.tone]} />
          </View>
        </View>
        <Text style={styles.caption}>판정은 나이 · 성별 같은 조건에 따라 달라질 수 있어요.</Text>
      </Box>
      {criterion.appliedRule ? (
        <View style={styles.section}>
          <Text style={styles.strong}>적용 기준</Text>
          <Text style={styles.body}>{criterion.appliedRule}</Text>
        </View>
      ) : null}
      {criterion.ranges.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.strong}>판정 범위</Text>
          {criterion.ranges.map((range) => (
            <View
              key={range.id}
              style={[styles.rangeRow, range.isCurrent && styles.rangeRowCurrent]}
            >
              <Badge
                label={range.label}
                showIcon={false}
                style={styles.rangeBadge}
                tone={badgeTone[range.tone]}
              />
              <Text style={[styles.body, styles.flex]}>{range.value}</Text>
              {range.isCurrent ? <Text style={styles.currentMark}>현재</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {criterion.referenceId ? (
        <AppButton
          onPress={() => onOpenReference(criterion.referenceId)}
          size="M"
          title="참고 출처 보기"
          variant="outline"
        />
      ) : null}
    </>
  );
}

function ReferenceContent({ reference }: { reference: ReferenceSource }) {
  const styles = useThemedStyles(createStyles);
  const rows = [
    ['기관', reference.organization],
    ['자료명', reference.documentName],
    ['발행 · 개정', reference.publishedAt],
    ['이 분석에 적용된 부분', reference.appliedSummary],
  ].filter(([, value]) => Boolean(value));
  return (
    <>
      <Text style={styles.description}>분석에 쓴 공식 기준의 내용이에요.</Text>
      <View style={styles.detailCard}>
        {rows.map(([label, value], index) => (
          <View key={label} style={[styles.detailRow, index > 0 && styles.divider]}>
            <Text style={styles.caption}>{label}</Text>
            <Text style={styles.body}>{value}</Text>
          </View>
        ))}
        {reference.appliedItems.length > 0 ? (
          <View style={[styles.detailRow, rows.length > 0 && styles.divider]}>
            <Text style={styles.caption}>Auto-Fit에서 쓴 항목</Text>
            <View style={styles.tags}>
              {reference.appliedItems.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      <AppButton
        onPress={() => void openExternalUrl(reference.originalUrl ?? undefined)}
        size="M"
        title="원문 보기"
        variant="outline"
      />
    </>
  );
}

// Detail sheets opened from the analysis screen: extra metrics, a metric's rule, and a source.
export function TotalAnalysisBottomSheet({ sheet, onClose, onOpenReference }: Props) {
  const styles = useThemedStyles(createStyles);
  const title =
    sheet?.type === 'additional'
      ? sheet.reason.sheetTitle
      : sheet?.type === 'criterion'
        ? `${sheet.criterion.metricName} 판정 기준`
        : sheet?.type === 'reference'
          ? sheet.reference.title
          : '';

  return (
    <AppBottomSheet
      contentStyle={styles.content}
      lockBackgroundScroll
      onClose={onClose}
      scrollable="when-overflow"
      title={title}
      visible={sheet !== null}
    >
      {sheet?.type === 'additional' ? <AdditionalMetricsContent reason={sheet.reason} /> : null}
      {sheet?.type === 'criterion' ? (
        <CriterionContent criterion={sheet.criterion} onOpenReference={onOpenReference} />
      ) : null}
      {sheet?.type === 'reference' ? <ReferenceContent reference={sheet.reference} /> : null}
    </AppBottomSheet>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    content: { gap: 16, paddingBottom: 8 },
    flex: { flex: 1 },
    description: { ...text.body2, color: colors.textSecondary },
    caption: { ...text.caption, color: colors.textSecondary },
    body: { ...text.body2, color: colors.textBody },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    box: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    metricRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    currentRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    currentValue: { ...text.title1, color: colors.textPrimary },
    currentJudge: { alignItems: 'flex-end', gap: 6 },
    section: { gap: 8 },
    rangeRow: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    rangeRowCurrent: { borderColor: colors.textPrimary, borderWidth: 1.5 },
    rangeBadge: { alignSelf: 'center' },
    currentMark: { ...text.captionStrong, color: colors.textPrimary },
    detailCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    detailRow: { gap: 4, paddingVertical: 12 },
    divider: { borderTopColor: colors.border, borderTopWidth: 1 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    tag: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagText: { ...text.caption, color: colors.textBody },
  } as const;
}
