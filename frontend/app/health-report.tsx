import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import Back from '@/assets/figma/main/a08ac.svg';
import {
  getHealthReport,
  type BodyMeasurement,
  type CheckupMeasurement,
  type HealthReport,
} from '@/src/api/healthReport';
import { getApiErrorMessage } from '@/src/api/client';
import { colors, fontFamilies } from '@/src/theme';

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
  return value.slice(5, 10).replace('-', '/');
}

function Chart({ entries, width, target }: { entries: { date: string; value: number }[]; width: number; target?: number | null }) {
  const height = 172;
  const left = 25;
  const right = width - 18;
  const top = 18;
  const bottom = 128;
  const values = [...entries.map((entry) => entry.value), ...(target ? [target] : [])];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, high * 0.04, 1);
  const min = low - span * 0.15;
  const max = high + span * 0.15;
  const points = entries.map((entry, index) => ({
    x: entries.length === 1 ? (left + right) / 2 : left + (index / (entries.length - 1)) * (right - left),
    y: bottom - ((entry.value - min) / (max - min)) * (bottom - top),
  }));
  const line = points.map((point) => point.x + ',' + point.y).join(' ');
  const targetY = target ? bottom - ((target - min) / (max - min)) * (bottom - top) : null;
  return (
    <Svg width={width} height={height} accessible accessibilityLabel="측정값 추이 그래프">
      {[0, 1, 2].map((index) => {
        const y = top + (index / 2) * (bottom - top);
        return <Line key={index} x1={left} x2={right} y1={y} y2={y} stroke={colors.border} strokeDasharray="3 4" />;
      })}
      {targetY !== null ? <>
        <Line x1={left} x2={right} y1={targetY} y2={targetY} stroke={colors.primaryDark} strokeDasharray="4 4" />
        <SvgText x={right} y={targetY - 5} textAnchor="end" fill={colors.primaryDark} fontSize={10}>목표 {target?.toFixed(1)}</SvgText>
      </> : null}
      {points.length > 1 ? <Polyline points={line} fill="none" stroke={colors.primaryDark} strokeWidth={2.5} /> : null}
      {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={4} fill={colors.surface} stroke={colors.primaryDark} strokeWidth={2} />)}
      <SvgText x={left} y={height - 14} fill={colors.textSecondary} fontSize={10}>{formatDate(entries[0].date)}</SvgText>
      <SvgText x={right} y={height - 14} textAnchor="end" fill={colors.textSecondary} fontSize={10}>{formatDate(entries[entries.length - 1].date)}</SvgText>
    </Svg>
  );
}

export default function HealthReportScreen() {
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
  const previous = entries.at(-2);
  const delta = latest && previous ? latest.value - previous.value : null;
  const chartWidth = Math.max(230, Math.min(width - 72, 430));
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
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 34 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}><Back /></Pressable>
          <Text style={styles.title}>건강 리포트</Text>
          <View style={styles.back} />
        </View>
        <View style={styles.tabs}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'checkup' }} onPress={() => switchSection('checkup')} style={[styles.tab, section === 'checkup' && styles.activeTab]}>
            <Text style={[styles.tabText, section === 'checkup' && styles.activeTabText]}>건강검진</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'body' }} onPress={() => switchSection('body')} style={[styles.tab, section === 'body' && styles.activeTab]}>
            <Text style={[styles.tabText, section === 'body' && styles.activeTabText]}>인바디</Text>
          </Pressable>
        </View>
        <View style={styles.metricRow}>
          {metrics.map((metric) => (
            <Pressable key={metric.key} accessibilityRole="button" accessibilityState={{ selected: selectedMetric.key === metric.key }} onPress={() => setMetricKey(metric.key)} style={[styles.metricChip, selectedMetric.key === metric.key && styles.selectedChip]}>
              <Text style={[styles.metricText, selectedMetric.key === metric.key && styles.selectedMetricText]}>{metric.label}</Text>
            </Pressable>
          ))}
        </View>
        {loading ? <ActivityIndicator color={colors.primaryDark} style={styles.spinner} /> : null}
        {error ? (
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setAttempt((value) => value + 1); }} style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.error}>{error} · 다시 시도하기</Text>
          </Pressable>
        ) : null}
        {!loading && !error && !latest ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>최근 6개월의 {selectedMetric.label} 기록이 없어요.</Text>
            <Text style={styles.note}>확정한 건강검진·체성분 기록이 표시돼요.</Text>
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
                <Text style={styles.value}>{latest.value.toFixed(1)} <Text style={styles.unit}>{selectedMetric.unit}</Text></Text>
                {delta !== null ? <Text style={styles.delta}>지난 기록보다 {delta > 0 ? '+' : ''}{delta.toFixed(1)}{selectedMetric.unit}</Text> : null}
              </View>
              <Chart entries={entries} width={chartWidth} target={chartTarget} />
            </View>
            <Text style={styles.sectionTitle}>측정 기록</Text>
            <View style={styles.records}>
              {[...entries].reverse().slice(0, 8).map((entry, index) => {
                const older = entries[entries.length - 2 - index];
                const change = older ? entry.value - older.value : null;
                return (
                  <View key={entry.date + '-' + index} style={styles.record}>
                    <Text style={styles.recordDate}>{entry.date.slice(0, 10)}</Text>
                    <Text style={styles.recordValue}>{entry.value.toFixed(1)}{selectedMetric.unit}</Text>
                    <Text style={styles.recordDelta}>{change === null ? '—' : (change > 0 ? '+' : '') + change.toFixed(1)}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.note}>측정값과 추이는 참고용이에요. 목표·의학적 판정은 별도 분석 결과를 확인해 주세요.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 16 },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  back: { width: 32, minHeight: 32, justifyContent: 'center' },
  title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 17 },
  tabs: { backgroundColor: colors.background, borderRadius: 12, padding: 4, flexDirection: 'row' },
  tab: { height: 34, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  activeTab: { backgroundColor: colors.surface },
  tabText: { color: colors.textSecondary, fontSize: 12 },
  activeTabText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metricChip: { minHeight: 31, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selectedChip: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  metricText: { fontSize: 12, color: colors.textBody },
  selectedMetricText: { color: colors.surface },
  spinner: { marginVertical: 40 },
  errorBox: { padding: 14, backgroundColor: colors.dangerLight, borderRadius: 10 },
  error: { color: colors.danger, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  note: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 },
  upload: { marginTop: 7, backgroundColor: colors.primaryDark, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 20 },
  uploadText: { color: colors.surface, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  chartCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, alignItems: 'center' },
  chartHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartLabel: { color: colors.textSecondary, fontSize: 12 },
  period: { color: colors.textSecondary, fontSize: 11, borderWidth: 1, borderColor: colors.border, padding: 5, borderRadius: 7 },
  valueRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  value: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 23 },
  unit: { fontSize: 12 },
  delta: { color: colors.success, fontSize: 11 },
  sectionTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, marginTop: 3 },
  records: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14 },
  record: { minHeight: 47, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordDate: { flex: 1, color: colors.textBody, fontSize: 12 },
  recordValue: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  recordDelta: { minWidth: 38, textAlign: 'right', color: colors.textSecondary, fontSize: 11 },
});
