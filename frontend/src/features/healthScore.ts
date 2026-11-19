import type { HealthScoreLatest } from '@/src/api/healthAnalysis';
import type { HealthDocumentConfirmationResponse } from '@/src/api/healthDocuments';

// The health score card of 종합 건강 분석 (back-end d5b96a9a contract, 11/19):
// - overall: a finished assessment, its overall score (never a 0 made up when there is none)
// - partial: only the health-data part is scored yet; no overall change, tier change or overall bar
// - check:   a partial assessment whose health-data part could not be scored: check the measurements
// - failed:  the score could not be read (502 and the like): offer to try again, never "no score"
// - none:    no assessment yet
export type ScoreCard =
  | { kind: 'overall'; score: number; total: number }
  | { kind: 'partial'; score: number }
  | { kind: 'check' }
  | { kind: 'failed' }
  | { kind: 'none' };

// latest: the new score API's answer, 'missing' for 404 (no assessment, or a server without the API yet),
// 'failed' for any other error. home: the overall score the home API gives (finished assessments only).
export function scoreCard(
  latest: HealthScoreLatest | 'missing' | 'failed',
  home: { score: number | null; total: number | null } | null,
): ScoreCard {
  if (latest === 'failed') return { kind: 'failed' };
  if (latest === 'missing') {
    // a server before d5b96a9a answers 404 too: the home's finished score still counts
    return home?.score != null ? { kind: 'overall', score: home.score, total: home.total ?? 100 } : { kind: 'none' };
  }
  if (latest.score_status === 'available' && latest.overall_score != null) {
    return { kind: 'overall', score: latest.overall_score, total: home?.total ?? 100 };
  }
  if (latest.health_data?.status === 'available' && latest.health_data.score != null) {
    return { kind: 'partial', score: latest.health_data.score };
  }
  return { kind: 'check' };
}

export type ConfirmNotice = { title: string; body: string; retry: string[] } | null;
const OTHER: Record<string, string> = { health_checkup: '인바디', body_composition: '건강검진표' };

// What to tell after documents are confirmed, by analysis_status. The numbers are saved in every case;
// a failed analysis is tried again with the same document id, never a new upload.
export function confirmNotice(confirmations: Pick<HealthDocumentConfirmationResponse, 'analysis_status' | 'document_type' | 'uploaded_file_id'>[]): ConfirmNotice {
  const failed = confirmations.filter((item) => item.analysis_status === 'failed');
  if (failed.length) {
    return { title: '수치는 저장했어요', body: '건강 데이터 점수를 계산하지 못했어요. 다시 시도해 주세요.', retry: failed.map((item) => item.uploaded_file_id) };
  }
  if (confirmations.some((item) => item.analysis_status === 'unavailable')) {
    return { title: '수치는 저장했어요', body: '점수 계산은 아직 준비 중이에요.', retry: [] };
  }
  const waiting = confirmations.find((item) => item.analysis_status === 'waiting_for_documents');
  if (waiting && !confirmations.some((item) => item.analysis_status === 'saved')) {
    const other = OTHER[waiting.document_type];
    return { title: '수치를 저장했어요', body: other ? `${other}도 확인하면 건강 데이터 점수가 나와요.` : '검진표와 인바디를 모두 확인하면 건강 데이터 점수가 나와요.', retry: [] };
  }
  return null;
}
