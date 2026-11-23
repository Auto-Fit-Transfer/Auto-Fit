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
  const tooltip = `${formatLongDate(lastEntry.date)} · ${formatValue(lastEntry.value, unit)}${unit}`;
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

// Every measurement the papers gave, one kind at a time: opened from the report's weight and score card.
export default function HealthRecordsScreen() {
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
      <ScreenHeader onBack={() => router.back()} title="측정 기록" />
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
  // Renewal A: one dark outline on every piece, a ledge under what can be pressed, pixel letters.
  const p12 = { fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 } as const;
  const p15 = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  const outline = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 } as const;
  const soft = '0 0 0 transparent'; // renewal B: no ledges
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },
    tabs: { flexDirection: 'row', gap: 6 },
    tab: { ...outline, alignItems: 'center', borderRadius: 14, boxShadow: soft, flex: 1, height: 46, justifyContent: 'center' },
    // The kind I am on is violet, with the full dark ledge.
    activeTab: { backgroundColor: colors.primary, },
    tabText: { ...p15, color: colors.ink },
    activeTabText: { color: colors.onPrimary },
    metricScroll: { flexGrow: 0, marginHorizontal: -16 },
    metricRow: { gap: 8, paddingBottom: 4, paddingHorizontal: 16 },
    metricChip: { ...outline, alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', paddingHorizontal: 14 },
    selectedChip: { backgroundColor: colors.primary, borderColor: colors.border },
    metricText: { ...p15, color: colors.ink },
    selectedMetricText: { color: colors.onPrimary },
    spinner: { marginVertical: 40 },
    errorBox: { ...outline, borderRadius: 14, padding: 14 },
    error: { ...p15, color: colors.danger },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
    emptyTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28, textAlign: 'center' },
    note: { ...p12, color: colors.textSecondary },
    upload: { ...outline, borderRadius: 10, marginTop: 8, minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
    uploadText: { ...p15, color: colors.ink },
    chartCard: { ...outline, alignItems: 'center', borderRadius: 18, boxShadow: soft, padding: 16 },
    chartHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    chartLabel: { ...p12, color: colors.textSecondary },
    period: { ...outline, ...p12, borderRadius: 10, color: colors.ink, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
    valueRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, marginTop: 10, width: '100%' },
    value: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 36, lineHeight: 40 },
    unit: { ...p12, color: colors.textSecondary },
    // What changed since the last record is points gained, so it wears gold.
    delta: { ...p12, backgroundColor: colors.gold, borderColor: colors.border, borderRadius: 99, borderWidth: 1, color: '#2B2000', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
    sectionTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28, marginTop: 4 },
    records: { ...outline, borderRadius: 18, boxShadow: soft, paddingHorizontal: 14 },
    record: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 52 },
    recordDivider: { borderTopColor: colors.track, borderTopWidth: 2 },
    recordDate: { ...p15, color: colors.ink, flex: 1 },
    recordValue: { ...p15, color: colors.ink },
    recordDelta: { ...p12, color: colors.textSecondary, minWidth: 38, textAlign: 'right' },
  } as const;
}
