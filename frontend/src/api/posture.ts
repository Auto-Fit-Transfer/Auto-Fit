import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { apiRequest } from './client';

export type PostureCapability = {
  exercise_code: string;
  display_name_ko: string;
  camera_view: 'side' | 'front';
  movement_type: string;
  analysis_side_required: boolean;
  validation_status: 'validated' | 'experimental';
  rule_version: string;
  catalog_exercise_keys: string[];
  capture_instructions: string[];
  limitations: string[];
};

export type PostureJob = {
  posture_analysis_job_id: string;
  exercise_code: string;
  camera_view: 'side' | 'front';
  status: 'awaiting_upload' | 'processing' | 'cleanup_pending' | 'completed' | 'failed';
  analysis_stage: string;
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
    schema_version: string;
    model_version: string;
    verdict: 'within_current_rules' | 'needs_correction';
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

export function getPostureCapabilities() {
  return apiRequest<{ schema_version: string; exercises: PostureCapability[] }>('/api/posture/capabilities');
}

export function createPostureJob(profile: PostureCapability, analysisSide: 'left' | 'right' | null = null) {
  return apiRequest<{ posture_analysis_job_id: string; status: string }>('/api/posture/jobs', {
    method: 'POST',
    body: JSON.stringify({
      exercise_key: profile.catalog_exercise_keys[0],
      exercise_code: profile.exercise_code,
      camera_view: profile.camera_view,
      analysis_side: profile.analysis_side_required ? analysisSide : null,
    }),
  });
}

export type PostureVideo = { uri: string; mimeType: string; name: string };

// Waits for the server's analysis and cleanup too, so it can take a while.
export async function uploadPostureVideo(jobId: string, video: PostureVideo) {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    formData.append('video', await (await fetch(video.uri)).blob(), video.name);
  } else {
    // The app's other uploads send a real file like this; its type comes from the extension (.mov is video/quicktime).
    formData.append('video', new File(video.uri), video.name);
  }
  return apiRequest<{ posture_analysis_job_id: string; status: string }>(
    `/api/posture/jobs/${encodeURIComponent(jobId)}/video`, { method: 'POST', body: formData },
  );
}

export function getPostureJob(jobId: string) {
  return apiRequest<PostureJob>(`/api/posture/jobs/${encodeURIComponent(jobId)}`);
}

export function getPostureResult(jobId: string) {
  return apiRequest<PostureResult>(`/api/posture/jobs/${encodeURIComponent(jobId)}/result`);
}
