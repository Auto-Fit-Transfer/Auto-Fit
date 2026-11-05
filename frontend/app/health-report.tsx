import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  getHealthReport,
  type BodyMeasurement,
  type CheckupMeasurement,
  type HealthReport,
} from '@/src/api/healthReport';
import { getApiErrorMessage } from '@/src/api/client';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

type Section = 'body' | 'checkup';
type Measurement = BodyMeasurement | CheckupMeasurement;
type Metric = { key: string; label: string; unit: string };
const bodyMetrics: Metric[] = [
  { key: 'weight_kg', label: '체중', unit: 'kg' },
  { key: 'skeletal_muscle_mass_kg', label: '골격근량', unit: 'kg' },
  { key: 'body_fat_percentage', label: '체지방률', unit: '%' },
  { key: 'bmi', label: 'BMI', unit: '' },
];
const checkupMetrics: Metric[] = [
  { key: 'weight_kg', label: '체중', unit: 'kg' },
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'systolic_bp', label: '수축기 혈압', unit: 'mmHg' },
  { key: 'fasting_glucose', label: '공복혈당', unit: 'mg/dL' },
  { key: 'total_cholesterol', label: '총콜레스테롤', unit: 'mg/dL' },
];

function dateOf(item: Measurement) {
  return 'measured_at' in item ? item.measured_at : item.checkup_date;
}

function numeric(item: Measurement, key: string) {
  const value = (item as unknown as Record<string, unknown>)[key];
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatDate(value: string) {
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
}

function formatLongDate(value: string) {
  return `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일`;
}

const formatValue = (value: number, unit: string) =>
  Number.isInteger(value) && unit.includes('m') ? String(value) : value.toFixed(1);
const signed = (value: number, unit: string) => `${value > 0 ? '+' : ''}${formatValue(value, unit)}`;

function Chart({ entries, width, target, unit }: { entries: { date: string; value: number }[]; width: number; target?: number | null; unit: string }) {
  const { colors } = useAppTheme();
  const height = 240;
  const left = 44;
  const right = width - 14;
  const top = 44;
  const bottom = 192;
  const values = [...entries.map((entry) => entry.value), ...(target ? [target] : [])];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, high * 0.04, 1);
  const min = low - span * 0.2;
  const max = high + span * 0.2;
  const yOf = (value: number) => bottom - ((value - min) / (max - min)) * (bottom - top);
  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  const points = entries.map((entry, index) => ({
    x: entries.length === 1 ? (left + right) / 2 : left + (index / (entries.length - 1)) * (right - left),
    y: yOf(entry.value),
  }));
  const line = points.map((point) => point.x + ',' + point.y).join(' ');
  const last = points[points.length - 1];
  const lastEntry = entries[entries.length - 1];
  const area = `M${points[0].x},${bottom} ` + points.map((point) => `L${point.x},${point.y}`).join(' ') + ` L${last.x},${bottom} Z`;
  const targetY = target ? yOf(target) : null;
  const tooltip = `${formatDate(lastEntry.date)} · ${formatValue(lastEntry.value, unit)}${unit}`;
  const tooltipWidth = tooltip.length * 7.4 + 16;
  const tooltipX = Math.min(width - tooltipWidth, Math.max(0, last.x - tooltipWidth / 2));
  const tooltipY = Math.max(0, last.y - 36);
  const labelled = entries.length <= 6;
  return (
    <View accessible accessibilityLabel={`측정값 추이 그래프, 최근값 ${tooltip}`}>
    <Svg width={width} height={height}>
      {ticks.map((tick) => (
        <Line key={tick} x1={left} x2={right} y1={yOf(tick)} y2={yOf(tick)} stroke={colors.border} />
      ))}
      {ticks.map((tick) => (
        <SvgText key={tick} x={0} y={yOf(tick) + 4} fill={colors.textSecondary} fontSize={12}>{tick.toFixed(1)}</SvgText>
      ))}
      {points.length > 1 ? <Path d={area} fill={colors.gaugeTrack} opacity={0.6} /> : null}
      {targetY !== null ? <>
        <Line x1={left} x2={right} y1={targetY} y2={targetY} stroke={colors.primary} strokeDasharray="5 5" />
        <Rect x={left} y={targetY - 22} width={86} height={20} rx={6} fill={colors.primaryLight} />
        <SvgText x={left + 8} y={targetY - 8} fill="#3A2DB5" fontSize={12}>목표 {target?.toFixed(1)}{unit}</SvgText>
      </> : null}
      {points.length > 1 ? <Polyline points={line} fill="none" stroke={colors.textPrimary} strokeWidth={2} /> : null}
      {points.map((point, index) => {
        const isLast = index === points.length - 1;
        return <Circle key={index} cx={point.x} cy={point.y} r={4} fill={isLast ? colors.textPrimary : '#FFFFFF'} stroke={colors.textPrimary} strokeWidth={2} />;
      })}
      {labelled ? points.slice(0, -1).map((point, index) => (
        <SvgText key={index} x={point.x} y={point.y + 20} textAnchor="middle" fill={colors.textBody} fontSize={12}>{formatValue(entries[index].value, unit)}</SvgText>
      )) : null}
      <Rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={26} rx={8} fill={colors.textPrimary} />
      <SvgText x={tooltipX + tooltipWidth / 2} y={tooltipY + 17} textAnchor="middle" fill="#FFFFFF" fontSize={12}>{tooltip}</SvgText>
      {points.map((point, index) => {
        const isLast = index === points.length - 1;
        if (!labelled && index !== 0 && !isLast) return null;
        return <SvgText key={index} x={point.x} y={height - 14} textAnchor={isLast && points.length > 1 ? 'end' : index === 0 && points.length > 1 ? 'start' : 'middle'} fill={isLast ? colors.textPrimary : colors.textSecondary} fontWeight={isLast ? 'bold' : 'normal'} fontSize={12}>{formatDate(entries[index].date)}</SvgText>;
      })}
    </Svg>
    </View>
  );
}

export default function HealthReportScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const width = useWindowDimensions().width;
  const [report, setReport] = useState<HealthReport | null>(null);
  const [section, setSection] = useState<Section>('body');
  const [metricKey, setMetricKey] = useState('skeletal_muscle_mass_kg');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getHealthReport()
      .then((result) => { if (active) { setReport(result); setError(''); } })
      .catch((cause) => { if (active) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Retry replaces the focus callback so the previous request can no longer update this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));

  const metrics = section === 'body' ? bodyMetrics : checkupMetrics;
  const selectedMetric = metrics.find((metric) => metric.key === metricKey) ?? metrics[0];
  const raw: Measurement[] = section === 'body'
    ? report?.body_compositions ?? [] : report?.health_checkups ?? [];
  const entries = raw.flatMap((item) => {
    const value = numeric(item, selectedMetric.key);
    return value === null ? [] : [{ date: dateOf(item), value }];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries.at(-1);
  const first = entries.length > 1 ? entries[0] : null;
  const delta = latest && first ? latest.value - first.value : null;
  const chartWidth = Math.max(230, Math.min(width - 78, 430));
  const weightTarget = selectedMetric.key === 'weight_kg' && report?.target_weight_kg
    ? Number(report.target_weight_kg) : null;
  const chartTarget = weightTarget !== null && Number.isFinite(weightTarget) && weightTarget > 0
    ? weightTarget : null;

  const switchSection = (next: Section) => {
    setSection(next);
    setMetricKey(next === 'body' ? 'skeletal_muscle_mass_kg' : 'weight_kg');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => router.back()} title="건강 리포트" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 34 }]} showsVerticalScrollIndicator={false}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'checkup' }} onPress={() => switchSection('checkup')} style={[styles.tab, section === 'checkup' && styles.activeTab]}>
            <Text style={[styles.tabText, section === 'checkup' && styles.activeTabText]}>건강검진</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'body' }} onPress={() => switchSection('body')} style={[styles.tab, section === 'body' && styles.activeTab]}>
            <Text style={[styles.tabText, section === 'body' && styles.activeTabText]}>인바디</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.metricRow} horizontal showsHorizontalScrollIndicator={false} style={styles.metricScroll}>
          {metrics.map((metric) => (
            <Pressable key={metric.key} accessibilityRole="button" accessibilityState={{ selected: selectedMetric.key === metric.key }} onPress={() => setMetricKey(metric.key)} style={[styles.metricChip, selectedMetric.key === metric.key && styles.selectedChip]}>
              <Text style={[styles.metricText, selectedMetric.key === metric.key && styles.selectedMetricText]}>{metric.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {loading ? <ActivityIndicator color={colors.primaryText} style={styles.spinner} /> : null}
        {error ? (
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setAttempt((value) => value + 1); }} style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.error}>{error} · 다시 시도하기</Text>
          </Pressable>
        ) : null}
        {!loading && !error && !latest ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>최근 6개월의 {selectedMetric.label} 기록이 없어요.</Text>
            <Text style={styles.note}>확정한 건강검진 · 체성분 기록이 표시돼요.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/health-data-management')} style={styles.upload}><Text style={styles.uploadText}>건강 데이터 관리하기</Text></Pressable>
          </View>
        ) : null}
        {!loading && !error && latest ? (
          <>
            <View style={styles.chartCard}>
              <View style={styles.chartHeading}>
                <Text style={styles.chartLabel}>{selectedMetric.label}</Text>
                <Text style={styles.period}>최근 6개월</Text>
              </View>
              <View style={styles.valueRow}>
                <Text style={styles.value}>{formatValue(latest.value, selectedMetric.unit)} <Text style={styles.unit}>{selectedMetric.unit}</Text></Text>
                {delta !== null && first ? <Text style={styles.delta}>{Number(first.date.slice(5, 7))}월보다 {signed(delta, selectedMetric.unit)}{selectedMetric.unit}</Text> : null}
              </View>
              <Chart entries={entries} target={chartTarget} unit={selectedMetric.unit} width={chartWidth} />
            </View>
            <Text style={styles.sectionTitle}>측정 기록</Text>
            <View style={styles.records}>
              {[...entries].reverse().slice(0, 8).map((entry, index) => {
                const older = entries[entries.length - 2 - index];
                const change = older ? entry.value - older.value : null;
                return (
                  <View key={entry.date + '-' + index} style={[styles.record, index > 0 && styles.recordDivider]}>
                    <Text style={styles.recordDate}>{formatLongDate(entry.date)}</Text>
                    <Text style={styles.recordValue}>{formatValue(entry.value, selectedMetric.unit)}{selectedMetric.unit}</Text>
                    <Text style={styles.recordDelta}>{change === null ? '—' : signed(change, selectedMetric.unit)}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.note}>측정값과 추이는 참고용이에요. 목표 · 의학적 판정은 별도 분석 결과를 확인해 주세요.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
    tabs: { backgroundColor: colors.surfaceMuted, borderRadius: 16, flexDirection: 'row', padding: 4 },
    tab: { alignItems: 'center', borderRadius: 12, flex: 1, height: 38, justifyContent: 'center' },
    activeTab: { backgroundColor: colors.background },
    tabText: { color: colors.textSecondary, fontSize: 14 },
    activeTabText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium },
    metricScroll: { flexGrow: 0, marginHorizontal: -20 },
    metricRow: { gap: 8, paddingHorizontal: 20 },
    metricChip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
    selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
    metricText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    selectedMetricText: { color: '#FFFFFF' },
    spinner: { marginVertical: 40 },
    errorBox: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 14 },
    error: { color: colors.danger, fontSize: 14 },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
    emptyTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, textAlign: 'center' },
    note: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    upload: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, marginTop: 8, minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
    uploadText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    chartCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 18 },
    chartHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    chartLabel: { color: colors.textSecondary, fontSize: 14 },
    period: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 6 },
    valueRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, marginTop: 10, width: '100%' },
    value: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30 },
    unit: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 14 },
    delta: { backgroundColor: colors.surfaceMuted, borderRadius: 999, color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4 },
    sectionTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26, marginTop: 4 },
    records: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
    record: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 56 },
    recordDivider: { borderTopColor: colors.border, borderTopWidth: 1 },
    recordDate: { color: colors.textPrimary, flex: 1, fontSize: 16 },
    recordValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    recordDelta: { color: colors.textSecondary, fontSize: 14, minWidth: 38, textAlign: 'right' },
  } as const;
}
