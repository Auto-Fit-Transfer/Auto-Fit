import { ApiError, apiRequest, getApiErrorMessage } from '@/src/api/client';

export type HealthMetricStatus =
  | 'low'
  | 'normal'
  | 'caution'
  | 'high'
  | 'unknown'
  | 'review_required';

export type MetricRange = {
  status: HealthMetricStatus;
  min?: string | null;
  min_inclusive?: boolean;
  max?: string | null;
  max_inclusive?: boolean;
};

export type Metric = {
  key: string;
  unit: string;
  raw_value?: string | null;
  display_value?: string | null;
  value_origin?: 'reported' | 'calculated';
  measured_at?: string | null;
  status?: HealthMetricStatus;
  status_label?: string;
  criteria_id?: string | null;
  criteria_version?: string | null;
  criteria_type?: string | null;
  source_ids?: string[];
  applied_conditions?: Record<string, unknown>;
  ranges?: MetricRange[];
  missing_fields?: string[];
  discrepancy?: Record<string, string> | null;
};

export type Interpretation = {
  rule_id: string;
  text: string;
  evidence_metric_keys?: string[];
};

export type Source = {
  source_id: string;
  publisher: string;
  title: string;
  source_type: string;
  applied_excerpt_summary: string;
  url?: string | null;
  published_at?: string | null;
  revised_at?: string | null;
  verified_at?: string | null;
  applied_metric_keys?: string[];
};

export type RecommendationReason = {
  title: string;
  description: string;
  evidence_metric_keys?: string[];
};

export type MainAnalysisResponse = {
  headline: { title: string };
  summary: { title: string; description: string };
  goal: { text: string };
  strategy: { title: string; tags: string[]; message: string };
  key_metric_keys: string[];
  recommendation_reasons: RecommendationReason[];
  final_direction: { from: string; to: string };
  assessment_id: string;
};

export type PopupResponse = {
  assessment_id: string;
  calculation_version?: string;
  body_composition_id?: string | null;
  health_checkup_id?: string | null;
  criteria_snapshot_available?: boolean;
  metrics: Metric[];
  interpretation: Interpretation;
  sources: Source[];
};

export function getLatestHealthAnalysis() {
  return apiRequest<MainAnalysisResponse>('/api/health-assessments/latest');
}

export function getHealthAssessmentPopups(assessmentId: string) {
  return apiRequest<PopupResponse>(`/api/health-assessments/${encodeURIComponent(assessmentId)}/popups`);
}

export function isHealthAnalysisNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

export function getHealthAnalysisErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '로그인 정보를 확인한 뒤 다시 시도해 주세요.';
    if (error.status === 502) return '분석에 필요한 건강 데이터를 확인하지 못했어요.';
  }

  const message = getApiErrorMessage(error);
  return message || '종합 건강 분석을 불러오지 못했어요.';
}
