import { Alert, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChevronRightIcon from '@/assets/icons/common/chevrons/Right.svg';
import CloseIcon from '@/assets/icons/common/X.svg';
import BuildingIcon from '@/assets/icons/deco/Building.svg';
import CalendarIcon from '@/assets/icons/deco/CalendarBlank.svg';
import DocumentIcon from '@/assets/icons/system/Document.svg';
import InfoIcon from '@/assets/icons/system/Question.svg';
import LightbulbIcon from '@/assets/icons/system/Lightbulb.svg';
import ListIcon from '@/assets/icons/system/ListBullets.svg';
import WarningCircleIcon from '@/assets/icons/system/WarningCircle.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';

import type {
  AnalysisMetric,
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

const toneStyles = {
  normal: { color: colors.primaryDark, background: colors.primaryLight },
  warning: { color: '#FFA450', background: '#FFF9F4' },
  danger: { color: '#E57373', background: '#FFF1F1' },
} satisfies Record<AnalysisTone, { color: string; background: string }>;

function SheetHeading({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const headingContentWidth = Math.max(0, viewportWidth - 40);
  const descriptionScale = Math.min(1, headingContentWidth / 360);
  const descriptionFontSize = Math.max(14, 16 * descriptionScale);
  const descriptionLineHeight = 22 * (descriptionFontSize / 16);

  return (
    <View style={styles.heading}>
      <View style={styles.headingTitleRow}>
        <Text style={styles.headingTitle}>{title}</Text>
        <Pressable
          accessibilityLabel="닫기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <CloseIcon color={colors.primary} height={17} width={17} />
        </Pressable>
      </View>
      <Text
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        style={[
          styles.headingDescription,
          { fontSize: descriptionFontSize, lineHeight: descriptionLineHeight },
        ]}
      >
        {description}
      </Text>
    </View>
  );
}

function StatusBadge({
  label,
  tone = 'normal',
  large = false,
}: {
  label?: string;
  tone?: AnalysisTone;
  large?: boolean;
}) {
  if (!label) return null;
  const palette = toneStyles[tone];
  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: palette.background },
        large && styles.statusBadgeLarge,
      ]}
    >
      <Text style={[styles.statusText, { color: palette.color }, large && styles.statusTextLarge]}>
        {label}
      </Text>
    </View>
  );
}

function MetricCard({ metric }: { metric: AnalysisMetric }) {
  const Icon = metric.icon;
  const palette = toneStyles[metric.tone ?? 'normal'];
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: palette.background }]}>
          <Icon color={palette.color} height={30} width={30} />
        </View>
        <View style={styles.metricCopy}>
          <Text style={styles.metricName}>{metric.name}</Text>
          <Text style={styles.metricValue}>
            {metric.value}
            {metric.unit ? ` ${metric.unit}` : ''}
          </Text>
        </View>
        <StatusBadge label={metric.status} tone={metric.tone} />
      </View>
      <Text maxFontSizeMultiplier={1} numberOfLines={1} style={styles.metricDescription}>
        {metric.description}
      </Text>
    </View>
  );
}

function AdditionalMetricsContent({
  reason,
  onClose,
}: {
  reason: AnalysisReason;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheetContent}>
      <SheetHeading
        description={reason.sheetDescription}
        onClose={onClose}
        title={reason.sheetTitle}
      />
      <View style={styles.metricList}>
        {reason.additionalMetrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </View>
      <View style={styles.summaryBox}>
        <View style={styles.summaryTitleRow}>
          <LightbulbIcon color={colors.primaryDark} height={22} width={22} />
          <Text style={styles.summaryBoxTitle}>해석 요약</Text>
        </View>
        <Text style={styles.summaryBoxText}>{reason.interpretation}</Text>
      </View>
      <Text style={styles.sheetFootnote}>현재 전략 판단에 참고한 추가 건강 지표예요.</Text>
    </View>
  );
}

function CriterionContent({
  criterion,
  onClose,
  onOpenReference,
}: {
  criterion: MetricCriterion;
  onClose: () => void;
  onOpenReference: (referenceId: string) => void;
}) {
  return (
    <View style={styles.sheetContentWideGap}>
      <SheetHeading
        description={`현재 수치가 왜 '${criterion.status}'으로 판정되었는지 확인할 수 있어요.`}
        onClose={onClose}
        title={`${criterion.metricName} 판정 기준`}
      />
      <View style={styles.currentCard}>
        <View style={styles.currentInner}>
          <View style={styles.currentColumn}>
            <Text style={styles.currentLabel}>현재 수치</Text>
            <View style={styles.currentValueRow}>
              <Text numberOfLines={1} style={styles.currentValue}>
                {criterion.value}
              </Text>
              {criterion.unit ? (
                <Text numberOfLines={1} style={styles.currentUnit}>
                  {criterion.unit}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.currentDivider} />
          <View style={styles.currentColumn}>
            <Text style={styles.currentLabel}>현재 판정</Text>
            <StatusBadge label={criterion.status} large tone={criterion.tone} />
          </View>
        </View>
        <View style={styles.currentInfo}>
          <WarningCircleIcon color={colors.primaryDark} height={16} width={16} />
          <Text numberOfLines={1} style={styles.currentInfoText}>
            {criterion.metricName} 판정 결과는 사용자 조건에 따라 달라질 수 있어요.
          </Text>
        </View>
      </View>
      <View style={styles.criteriaSection}>
        <Text style={styles.sectionTitle}>적용 기준</Text>
        <View style={styles.ruleRow}>
          <View style={styles.smallIconCircle}>
            <DocumentIcon color={colors.primaryDark} height={18} width={18} />
          </View>
          <Text style={styles.ruleText}>{criterion.appliedRule}</Text>
        </View>
      </View>
      <View style={styles.criteriaSection}>
        <Text style={styles.sectionTitle}>판정 범위 예시</Text>
        <Text style={styles.rangeHelp}>
          아래 범위는 예시이며, 실제 적용 기준은 사용자 조건에 따라 달라질 수 있어요.
        </Text>
        <View style={styles.rangeList}>
          {criterion.ranges.map((range) => {
            const rangePalette = toneStyles[range.tone];
            return (
              <View key={range.id} style={[styles.rangeRow, { borderColor: rangePalette.color }]}>
                <View style={[styles.rangeLabel, { backgroundColor: rangePalette.background }]}>
                  <View style={[styles.rangeDot, { backgroundColor: rangePalette.color }]} />
                  <Text style={styles.rangeLabelText}>{range.label}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.rangeValue, range.isCurrent && { color: rangePalette.color }]}
                >
                  {range.value}
                </Text>
                {range.isCurrent ? (
                  <View style={[styles.currentPill, { backgroundColor: rangePalette.color }]}>
                    <Text style={styles.currentPillText}>현재 수치</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
      {criterion.referenceId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenReference(criterion.referenceId)}
          style={({ pressed }) => [styles.referenceButton, pressed && styles.pressed]}
        >
          <View style={styles.referenceButtonLeft}>
            <DocumentIcon color={colors.primaryDark} height={18} width={18} />
            <Text style={styles.referenceButtonText}>참고 출처 보기</Text>
          </View>
          <ChevronRightIcon color={colors.primaryDark} height={18} width={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

async function openExternalUrl(url?: string) {
  if (!url) {
    Alert.alert('원문 링크 준비 중', '확정된 원문 주소가 아직 등록되지 않았어요.');
    return;
  }
  try {
    if (!(await Linking.canOpenURL(url))) throw new Error('unsupported-url');
    await Linking.openURL(url);
  } catch {
    Alert.alert('링크를 열 수 없어요', '잠시 후 다시 시도해주세요.');
  }
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BuildingIcon;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.smallIconCircle}>
        <Icon color={colors.primaryDark} height={18} width={18} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function ReferenceContent({
  reference,
  onClose,
}: {
  reference: ReferenceSource;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheetContentWideGap}>
      <SheetHeading
        description="분석에 활용한 공식 기준의 내용을 확인할 수 있어요."
        onClose={onClose}
        title={reference.title}
      />
      <View style={styles.referenceDetailCard}>
        <DetailRow icon={BuildingIcon} label="기관" value={reference.organization} />
        <View style={styles.detailDivider} />
        <DetailRow icon={DocumentIcon} label="자료명" value={reference.documentName} />
        <View style={styles.detailDivider} />
        <DetailRow icon={CalendarIcon} label="발행·개정" value={reference.publishedAt} />
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <View style={styles.smallIconCircle}>
            <ListIcon color={colors.primaryDark} height={18} width={18} />
          </View>
          <View style={styles.detailCopy}>
            <Text style={styles.detailLabel}>Auto-Fit에서 활용한 항목</Text>
            <View style={styles.appliedChips}>
              {reference.appliedItems.map((item) => (
                <View key={item} style={styles.appliedChip}>
                  <Text style={styles.appliedChipText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <View style={styles.smallIconCircle}>
            <InfoIcon color={colors.primaryDark} height={18} width={18} />
          </View>
          <View style={styles.detailCopy}>
            <Text style={styles.detailLabel}>이 분석에 적용된 부분</Text>
            <Text style={styles.detailValue}>{reference.appliedSummary}</Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => openExternalUrl(reference.originalUrl ?? undefined)}
        style={({ pressed }) => [styles.referenceButton, pressed && styles.pressed]}
      >
        <View style={styles.referenceButtonLeft}>
          <DocumentIcon color={colors.primaryDark} height={18} width={18} />
          <Text style={styles.referenceButtonText}>원문 확인</Text>
        </View>
        <ChevronRightIcon color={colors.primaryDark} height={18} width={18} />
      </Pressable>
    </View>
  );
}

export function TotalAnalysisBottomSheet({ sheet, onClose, onOpenReference }: Props) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxSheetHeight = Math.max(0, viewportHeight - Math.max(insets.top, 12));

  return (
    <AppBottomSheet
      contentStyle={styles.bottomSheetContent}
      lockBackgroundScroll
      onClose={onClose}
      scrollable="when-overflow"
      separateAnimations
      sheetStyle={[styles.bottomSheet, { maxHeight: maxSheetHeight }]}
      visible={sheet !== null}
    >
      {sheet?.type === 'additional' ? (
        <AdditionalMetricsContent onClose={onClose} reason={sheet.reason} />
      ) : null}
      {sheet?.type === 'criterion' ? (
        <CriterionContent
          criterion={sheet.criterion}
          onClose={onClose}
          onOpenReference={onOpenReference}
        />
      ) : null}
      {sheet?.type === 'reference' ? (
        <ReferenceContent onClose={onClose} reference={sheet.reference} />
      ) : null}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    borderColor: colors.border,
    borderTopWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  bottomSheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  sheetContent: { gap: 16 },
  sheetContentWideGap: { gap: 24 },
  heading: { gap: 5 },
  headingTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  headingTitle: {
    flex: 1,
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 22,
  },
  headingDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 16,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2.5,
    elevation: 2,
  },
  metricList: { gap: 12 },
  metricCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    padding: 14,
    gap: 10,
    backgroundColor: colors.surface,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCopy: { flex: 1 },
  metricName: { fontSize: 16, color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold },
  metricValue: { fontSize: 22, color: colors.textBody, fontFamily: fontFamilies.pretendardBold },
  metricDescription: {
    alignSelf: 'stretch',
    marginHorizontal: -6,
    fontSize: 13,
    letterSpacing: -0.1,
    lineHeight: 20,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
  },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 13, fontFamily: fontFamilies.pretendardSemiBold },
  statusBadgeLarge: { paddingHorizontal: 18, paddingVertical: 5 },
  statusTextLarge: { fontSize: 18, fontFamily: fontFamilies.pretendardBold },
  summaryBox: { borderRadius: 20, padding: 14, gap: 8, backgroundColor: colors.primaryLight },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryBoxTitle: {
    color: colors.primaryDark,
    fontSize: 16,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  summaryBoxText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.pretendardMedium,
  },
  sheetFootnote: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 15,
    fontFamily: fontFamilies.pretendardMedium,
  },
  currentCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 10,
    alignItems: 'center',
    gap: 10,
  },
  currentInner: { flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%' },
  currentColumn: { flex: 1, alignItems: 'center', gap: 6 },
  currentLabel: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
  },
  currentValue: {
    fontSize: 32,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardBold,
  },
  currentValueRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  currentUnit: {
    flexShrink: 0,
    color: colors.primaryDark,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
  },
  currentDivider: { width: 1, height: 56, backgroundColor: '#D2EEE9' },
  currentInfo: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    marginHorizontal: -3,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  currentInfoText: {
    flexShrink: 1,
    color: colors.textBody,
    fontSize: 12,
    letterSpacing: -0.15,
    lineHeight: 17,
    fontFamily: fontFamilies.pretendardMedium,
  },
  criteriaSection: { gap: 12 },
  sectionTitle: {
    color: colors.primaryDark,
    fontSize: 20,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fontFamilies.pretendardMedium,
  },
  rangeHelp: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.pretendardMedium,
  },
  rangeList: { gap: 8 },
  rangeRow: {
    height: 45,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  rangeLabel: {
    flexBasis: '38%',
    maxWidth: 150,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
  },
  rangeDot: { width: 12, height: 12, borderRadius: 6 },
  rangeLabelText: { fontSize: 16, color: colors.textBody, fontFamily: fontFamilies.pretendardBold },
  rangeValue: {
    flex: 1,
    flexShrink: 1,
    paddingLeft: 10,
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
  },
  currentPill: { marginRight: 10, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 3 },
  currentPillText: {
    color: colors.surface,
    fontSize: 13,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  referenceButton: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referenceButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  referenceButtonText: {
    color: colors.primaryDark,
    fontSize: 16,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  referenceDetailCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fontFamilies.pretendardMedium,
  },
  detailValue: {
    color: colors.textBody,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  detailDivider: { height: 1, backgroundColor: colors.border },
  appliedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5, width: '100%' },
  appliedChip: {
    width: '49%',
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  appliedChipText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontFamily: fontFamilies.pretendardSemiBold,
  },
  pressed: { opacity: 0.72 },
});
