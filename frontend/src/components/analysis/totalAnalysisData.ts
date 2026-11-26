import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import BmiIcon from '@/assets/icons/data/BMI.svg';
import BmrIcon from '@/assets/icons/data/BMR.svg';
import BodyFatIcon from '@/assets/icons/data/BodyFat_Percentage.svg';
import CholesterolIcon from '@/assets/icons/data/Cholesterol.svg';
import DiabetesIcon from '@/assets/icons/data/Diabetes.svg';
import MuscleIcon from '@/assets/icons/data/Muscle.svg';
import WeightIcon from '@/assets/icons/data/Weight.svg';
import UserIcon from '@/assets/icons/input/User.svg';

import type {
  HealthMetricStatus,
  MainAnalysisResponse,
  Metric,
  MetricRange,
  PopupResponse,
} from '@/src/api/healthAnalysis';

export type AnalysisIcon = ComponentType<SvgProps>;

export type AnalysisTone = 'normal' | 'warning' | 'danger';

export type AnalysisMetric = {
  id: string;
  name: string;
  value: string;
  status: string;
  tone: AnalysisTone;
  icon: AnalysisIcon;
  unit?: string;
  description: string;
  ranges?: MetricRange[];
  sourceIds?: string[];
  appliedConditions?: Record<string, unknown>;
  missingFields?: string[];
  discrepancy?: Record<string, string> | null;
};

export type AnalysisReason = {
  id: string;
  title: string;
  description: string;
  icon: AnalysisIcon;
  metricSummary: string;
  interpretation: string;
  additionalMetrics: AnalysisMetric[];
  sheetTitle: string;
  sheetDescription: string;
};

export type CriterionRange = {
  id: string;
  label: string;
  value: string;
  tone: AnalysisTone;
  isCurrent?: boolean;
};

export type MetricCriterion = {
  id: string;
  metricName: string;
  value: string;
  unit?: string;
  status: string;
  tone: AnalysisTone;
  icon: AnalysisIcon;
  summary: string;
  ranges: CriterionRange[];
  referenceId: string;
};

export type ReferenceSource = {
  id: string;
  title: string;
  organization: string;
  documentName: string;
  description: string;
  appliedItems: string[];
  appliedContent: string;
  publishedAt: string;
  appliedSummary: string;
  originalUrl?: string | null;
};

export type AnalysisDisplayData = {
  assessmentId: string;
  headline: string;
  summary: { title: string; description: string };
  goal: string;
  strategy: { title: string; tags: string[]; message: string };
  keyMetrics: AnalysisMetric[];
  reasons: AnalysisReason[];
  finalDirection: { from: string; to: string };
  metricCriteria: MetricCriterion[];
  references: ReferenceSource[];
  criteriaSnapshotAvailable: boolean;
};

const metricPresentation: Record<string, { label: string; icon: AnalysisIcon }> = {
  bmi: { label: 'BMI', icon: BmiIcon },
  weight_kg: { label: '체중', icon: WeightIcon },
  skeletal_muscle_mass_kg: { label: '골격근량', icon: MuscleIcon },
  body_fat_percentage: { label: '체지방률', icon: BodyFatIcon },
  body_fat_mass_kg: { label: '체지방량', icon: BodyFatIcon },
  basal_metabolic_rate: { label: '기초대사량', icon: BmrIcon },
  fasting_glucose: { label: '공복혈당', icon: DiabetesIcon },
  hba1c: { label: '당화혈색소', icon: DiabetesIcon },
  total_cholesterol: { label: '총 콜레스테롤', icon: CholesterolIcon },
  ldl_cholesterol: { label: 'LDL 콜레스테롤', icon: CholesterolIcon },
  hdl_cholesterol: { label: 'HDL 콜레스테롤', icon: CholesterolIcon },
  triglycerides: { label: '중성지방', icon: CholesterolIcon },
};

const additionalMetricsSheetTitle = '체성분 관련 추가 지표';
const additionalMetricsSheetDescription = '핵심 지표와 함께 참고한 보조 수치에요';

function getMetricTone(status?: HealthMetricStatus): AnalysisTone {
  if (status === 'high') return 'danger';
  if (status === 'low' || status === 'caution') return 'warning';
  return 'normal';
}

function getRangeValue(range: MetricRange) {
  const min = range.min ?? '';
  const max = range.max ?? '';

  if (min && max) return `${min} ~ ${max}`;
  if (min) return `${range.min_inclusive === false ? '초과' : '이상'} ${min}`;
  if (max) return `${range.max_inclusive === false ? '미만' : '이하'} ${max}`;
  return '-';
}

function getRangeLabel(status: HealthMetricStatus) {
  switch (status) {
    case 'low':
      return '낮음';
    case 'normal':
      return '정상';
    case 'caution':
      return '주의';
    case 'high':
      return '높음';
    case 'review_required':
      return '검토 필요';
    case 'unknown':
    default:
      return '알 수 없음';
  }
}

function toAnalysisMetric(metric: Metric): AnalysisMetric {
  const presentation = metricPresentation[metric.key];
  const value = metric.display_value ?? metric.raw_value ?? '-';

  return {
    id: metric.key,
    name: presentation?.label ?? metric.key,
    value,
    status: metric.status_label ?? (metric.status ? getRangeLabel(metric.status) : '-'),
    tone: getMetricTone(metric.status),
    icon: presentation?.icon ?? WeightIcon,
    unit: metric.unit,
    description: '',
    ranges: metric.ranges,
    sourceIds: metric.source_ids,
    appliedConditions: metric.applied_conditions,
    missingFields: metric.missing_fields,
    discrepancy: metric.discrepancy,
  };
}

function toMetricCriterion(metric: Metric): MetricCriterion {
  const displayMetric = toAnalysisMetric(metric);
  const sourceId = metric.source_ids?.[0];

  return {
    id: metric.key,
    metricName: displayMetric.name,
    value: displayMetric.value,
    unit: metric.unit,
    status: displayMetric.status,
    tone: displayMetric.tone,
    icon: displayMetric.icon,
    summary: metric.criteria_type ?? '',
    ranges: (metric.ranges ?? []).map((range, index) => ({
      id: `${metric.key}-${index}-${range.status}`,
      label: getRangeLabel(range.status),
      value: getRangeValue(range),
      tone: getMetricTone(range.status),
      isCurrent: metric.status === range.status,
    })),
    referenceId: sourceId ?? '',
  };
}

function getMetricMap(metrics: Metric[]) {
  return new Map(metrics.map((metric) => [metric.key, metric]));
}

function getMetricsByKey(metricMap: Map<string, Metric>, keys: string[]) {
  return keys
    .map((key) => metricMap.get(key))
    .filter((metric): metric is Metric => Boolean(metric));
}

export function createAnalysisDisplayData(
  analysis: MainAnalysisResponse,
  popups: PopupResponse,
): AnalysisDisplayData {
  const metricMap = getMetricMap(popups.metrics);

  return {
    assessmentId: analysis.assessment_id,
    headline: analysis.headline.title,
    summary: analysis.summary,
    goal: analysis.goal.text,
    strategy: analysis.strategy,
    keyMetrics: getMetricsByKey(metricMap, analysis.key_metric_keys.slice(0, 3)).map(
      toAnalysisMetric,
    ),
    reasons: analysis.recommendation_reasons.map((reason, index) => {
      const evidenceMetrics = getMetricsByKey(
        metricMap,
        reason.evidence_metric_keys ?? [],
      ).map(toAnalysisMetric);

      return {
        id: `${index}-${reason.title}`,
        title: reason.title,
        description: reason.description,
        icon: UserIcon,
        metricSummary: evidenceMetrics.map((metric) => metric.name).join(' · '),
        interpretation: popups.interpretation.text,
        additionalMetrics: evidenceMetrics,
        sheetTitle: additionalMetricsSheetTitle,
        sheetDescription: additionalMetricsSheetDescription,
      };
    }),
    finalDirection: analysis.final_direction,
    metricCriteria: getMetricsByKey(metricMap, analysis.key_metric_keys).map(toMetricCriterion),
    references: popups.sources.map((source) => ({
      id: source.source_id,
      title: source.title,
      organization: source.publisher,
      documentName: source.title,
      description: source.applied_excerpt_summary,
      appliedItems: (source.applied_metric_keys ?? []).map(
        (key) => metricPresentation[key]?.label ?? key,
      ),
      appliedContent: source.applied_excerpt_summary,
      publishedAt: source.published_at ?? source.revised_at ?? source.verified_at ?? '-',
      appliedSummary: source.applied_excerpt_summary,
      originalUrl: source.url,
    })),
    criteriaSnapshotAvailable: popups.criteria_snapshot_available ?? false,
  };
}
