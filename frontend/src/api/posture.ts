import { apiRequest } from './client';

export type PostureJob = {
  posture_analysis_job_id: string;
  exercise_code: 'squat';
  camera_view: 'side';
  status: 'awaiting_upload' | 'processing' | 'cleanup_pending' | 'completed' | 'failed';
  analysis_stage: 'waiting' | 'joint_detection' | 'posture_scoring' | 'result_summary' | 'complete' | 'failed';
  progress_percent: number;
  processed_frames: number;
  total_frames: number | null;
  detected_repetitions: number;
  capture_duration_ms: number | null;
  created_at: string;
  finished_at: string | null;
  failure_code: string | null;
};

export type PostureKeypoint = {
  joint_code: string;
  x_normalized: number;
  y_normalized: number;
  confidence: number;
};

export type PostureAngle = {
  angle_code: string;
  measured_degrees: number;
  target_min_degrees: number | null;
  target_max_degrees: number | null;
};

export type PostureRepetition = {
  posture_repetition_id: string;
  repetition_number: number;
  start_offset_ms: number;
  keyframe_offset_ms: number;
  end_offset_ms: number;
  score: number;
  keypoints: PostureKeypoint[];
  angles: PostureAngle[];
};

export type PostureFinding = {
  posture_finding_id: string;
  display_order: number;
  finding_type: 'correction' | 'positive';
  finding_code: string;
  title: string;
  explanation: string;
  repetition_start: number | null;
  repetition_end: number | null;
  guidance_steps: { sequence_order: number; instruction: string }[];
};

export type PostureSuggestion = {
  posture_routine_suggestion_id: string;
  posture_finding_id: string | null;
  display_order: number;
  exercise_name: string;
  prescription: string;
  target_sets: number | null;
  target_repetitions: number | null;
  applied_at: string | null;
};

export type PostureResult = {
  job: PostureJob;
  assessment: {
    posture_assessment_id: string;
    model_version: string;
    overall_score: number;
    passing_score: number | null;
    repetition_count: number;
    summary: string;
    assessed_at: string;
  };
  repetitions: PostureRepetition[];
  findings: PostureFinding[];
  routine_suggestions: PostureSuggestion[];
};

export function getPostureJob(jobId: string) {
  return apiRequest<PostureJob>(`/api/posture/jobs/${encodeURIComponent(jobId)}`);
}

export function getPostureResult(jobId: string) {
  return apiRequest<PostureResult>(`/api/posture/jobs/${encodeURIComponent(jobId)}/result`);
}
