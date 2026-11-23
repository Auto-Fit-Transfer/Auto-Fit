import { isHttpsUrl } from '@/src/lib/externalUrl';
import {
  Alert,
  Linking,
  Pressable,
  useWindowDimensions,
  View } from 'react-native';
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
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme, type Palette } from '@/src/theme';

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

function createToneStyles(colors: Palette) {
  // Renewal A: the words of a judgement are dark on a soft ground, never red letters; only the small
  // square beside a range keeps the tone's own colour.
  return {
    normal: { color: colors.ink, background: colors.primaryLight, mark: colors.primary },
    warning: { color: colors.ink, background: colors.warningLight, mark: colors.warning },
    danger: { color: colors.ink, background: colors.dangerLight, mark: colors.danger },
  } satisfies Record<AnalysisTone, { color: string; background: string; mark: string }>;
}

function SheetHeading({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
        numberOfLines={2}
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  if (!label) return null;
  const palette = createToneStyles(colors)[tone];
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const Icon = metric.icon;
  const palette = createToneStyles(colors)[metric.tone ?? 'normal'];
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
          <LightbulbIcon color={colors.primaryPressed} height={22} width={22} />
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
          <WarningCircleIcon color={colors.primaryPressed} height={16} width={16} />
          <Text numberOfLines={2} style={styles.currentInfoText}>
            {criterion.metricName} 판정 결과는 사용자 조건에 따라 달라질 수 있어요.
          </Text>
        </View>
      </View>
      <View style={styles.criteriaSection}>
        <Text style={styles.sectionTitle}>적용 기준</Text>
        <View style={styles.ruleRow}>
          <View style={styles.smallIconCircle}>
            <DocumentIcon color={colors.primaryPressed} height={18} width={18} />
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
            const rangePalette = createToneStyles(colors)[range.tone];
            return (
              <View key={range.id} style={[styles.rangeRow, { borderColor: rangePalette.color }]}>
                <View style={[styles.rangeLabel, { backgroundColor: rangePalette.background }]}>
                  <View style={[styles.rangeDot, { backgroundColor: rangePalette.mark }]} />
                  <Text style={styles.rangeLabelText}>{range.label}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.rangeValue, range.isCurrent && { color: rangePalette.color }]}
                >
                  {range.value}
                </Text>
                {range.isCurrent ? (
                  <View style={styles.currentPill}>
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
            <DocumentIcon color={colors.primaryPressed} height={18} width={18} />
            <Text style={styles.referenceButtonText}>참고 출처 보기</Text>
          </View>
          <ChevronRightIcon color={colors.primaryPressed} height={18} width={18} />
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
    if (!isHttpsUrl(url) || !(await Linking.canOpenURL(url))) throw new Error('unsupported-url');
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.detailRow}>
      <View style={styles.smallIconCircle}>
        <Icon color={colors.primaryPressed} height={18} width={18} />
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
            <ListIcon color={colors.primaryPressed} height={18} width={18} />
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
            <InfoIcon color={colors.primaryPressed} height={18} width={18} />
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
          <DocumentIcon color={colors.primaryPressed} height={18} width={18} />
          <Text style={styles.referenceButtonText}>원문 확인</Text>
        </View>
        <ChevronRightIcon color={colors.primaryPressed} height={18} width={18} />
      </Pressable>
    </View>
  );
}

export function TotalAnalysisBottomSheet({ sheet, onClose, onOpenReference }: Props) {
  const styles = useThemedStyles(createStyles);
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

function createStyles({ colors }: AppTheme) {
  // Renewal A: one dark outline on every piece, pixel letters, violet for what is mine.
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const outline = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 } as const;
  return {
    bottomSheet: { borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 2, overflow: 'hidden' },
    bottomSheetContent: { paddingBottom: 8, paddingHorizontal: 16, paddingTop: 16 },
    sheetContent: { gap: 14 },
    sheetContentWideGap: { gap: 20 },
    heading: { gap: 4 },
    headingTitleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6 },
    headingTitle: { color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    headingDescription: { ...p15, color: colors.textBody },
    close: { ...outline, alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
    metricList: { gap: 10 },
    metricCard: { ...outline, borderRadius: 14, gap: 8, padding: 12 },
    metricTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    metricIcon: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
    metricCopy: { flex: 1 },
    metricName: { ...p15, color: colors.ink },
    metricValue: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    metricDescription: { ...p12, alignSelf: 'stretch', color: colors.textBody },
    statusBadge: { borderColor: colors.border, borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 1 },
    statusText: p12,
    statusBadgeLarge: { paddingHorizontal: 12, paddingVertical: 4 },
    statusTextLarge: p15,
    summaryBox: { backgroundColor: colors.primaryLight, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 6, padding: 12 },
    summaryTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    summaryBoxTitle: { ...p15, color: colors.ink },
    summaryBoxText: { ...p12, color: colors.textBody },
    sheetFootnote: { ...p12, color: colors.textSecondary, textAlign: 'center' },
    currentCard: { ...outline, alignItems: 'center', borderRadius: 14, gap: 10, paddingBottom: 10, paddingHorizontal: 14, paddingTop: 16 },
    currentInner: { alignItems: 'center', flexDirection: 'row', gap: 16, width: '100%' },
    currentColumn: { alignItems: 'center', flex: 1, gap: 4 },
    currentLabel: { ...p12, color: colors.textSecondary },
    currentValue: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 36, lineHeight: 42 },
    currentValueRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'nowrap', gap: 4, justifyContent: 'center', maxWidth: '100%' },
    currentUnit: { ...p12, color: colors.textSecondary, flexShrink: 0 },
    currentDivider: { backgroundColor: colors.track, height: 56, width: 2 },
    currentInfo: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.primaryLight, borderRadius: 8, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 8 },
    currentInfoText: { ...p12, color: colors.ink, flexShrink: 1 },
    criteriaSection: { gap: 10 },
    sectionTitle: { ...p15, color: colors.ink },
    ruleRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    smallIconCircle: { alignItems: 'center', backgroundColor: colors.primaryLight, borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
    ruleText: { ...p12, color: colors.textBody, flex: 1 },
    rangeHelp: { ...p12, color: colors.textSecondary },
    rangeList: { gap: 8 },
    rangeRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 2, flexDirection: 'row', flexWrap: 'nowrap', height: 44, overflow: 'hidden' },
    rangeLabel: { alignItems: 'center', flexBasis: '38%', flexDirection: 'row', gap: 8, height: '100%', maxWidth: 150, paddingLeft: 12 },
    rangeDot: { height: 10, width: 10 },
    rangeLabelText: { ...p15, color: colors.ink },
    rangeValue: { ...p12, color: colors.textBody, flex: 1, flexShrink: 1, paddingLeft: 10 },
    currentPill: { backgroundColor: colors.primary, borderRadius: 99, marginRight: 10, paddingHorizontal: 6, paddingVertical: 2 },
    currentPillText: { ...p12, color: colors.onPrimary },
    referenceButton: { ...outline, alignItems: 'center', borderRadius: 12, flexDirection: 'row', height: 48, justifyContent: 'space-between', paddingHorizontal: 14 },
    referenceButtonLeft: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    referenceButtonText: { ...p15, color: colors.ink },
    referenceDetailCard: { ...outline, borderRadius: 14, overflow: 'hidden' },
    detailRow: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 12 },
    detailCopy: { flex: 1, gap: 2 },
    detailLabel: { ...p12, color: colors.textSecondary },
    detailValue: { ...p15, color: colors.ink },
    detailDivider: { backgroundColor: colors.track, height: 2 },
    appliedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5, width: '100%' },
    appliedChip: { backgroundColor: colors.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, width: '49%' },
    appliedChipText: { ...p12, color: colors.ink },
    pressed: { opacity: 0.72 },
  } as const;
}
