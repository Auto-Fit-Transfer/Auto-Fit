import { ApiError, apiRequest, getApiErrorMessage } from '@/src/api/client';

export function getRunningApiErrorMessage(error: unknown) {
  if (error instanceof ApiError && typeof error.detail !== 'string') {
    const code = error.detail && typeof error.detail === 'object'
      ? (error.detail as { code?: unknown }).code : undefined;
    if (code === 'RUNNING_SELECTION_EXPIRED_OR_INVALID') return '코스 선택 시간이 지났어요. 추천 목록에서 다시 열어 주세요.';
    if (code === 'RUNNING_PREVIEW_REQUIRED') return '이 코스는 경로를 검증한 뒤 저장할 수 있어요.';
    if (code === 'RUNNING_DISTANCE_ACCEPTANCE_REQUIRED') return '요청한 거리와 실제 거리 차이를 확인해 주세요.';
    if (code === 'AI_DISABLED' || code === 'AI_CONFIGURATION_ERROR') return '코스 추천 서버가 아직 준비되지 않았어요. 자유 러닝은 사용할 수 있어요.';
    if (error.status === 404) return '러닝 정보를 찾지 못했어요. 서버 반영 상태를 확인해 주세요.';
    if (error.status === 422) return '러닝 설정 또는 기록 상태를 다시 확인해 주세요.';
    if (error.status >= 500) return '러닝 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  return getApiErrorMessage(error);
}

export type RunningDistanceOption = '3km' | '5km' | '10km';
export type RunningCourse = {
  course_id: string;
  name?: string;
  course_name?: string;
  region?: string;
  distance_km?: number;
  estimated_duration_minutes?: number;
  difficulty?: string;
  description?: string;
  selection_token?: string;
  source?: { source_type?: string; provider?: string };
  source_type?: string;
  path?: RunningCoordinate[];
  start?: RunningCoordinate;
  end?: RunningCoordinate;
  waypoints?: RunningCoordinate[];
  requires_route_validation?: boolean;
  route_validated?: boolean;
  within_tolerance?: boolean;
  distance_error_percent?: number;
  thumbnail_url?: string;
};
export type RunningCoordinate = { latitude: number; longitude: number };
export type RunningSavedCourse = {
  running_saved_course_id: string;
  course_name: string;
  snapshot: RunningCourse;
  is_favorite: boolean;
  is_selected: boolean;
  updated_at: string;
};
export type RunningRoutePreview = {
  path: RunningCoordinate[];
  distance_km: number;
  preview_token: string;
  [key: string]: unknown;
};
export type RunningRecommendation = {
  status: 'matched' | 'generation_required';
  courses: RunningCourse[];
};

export function getRunningRecommendations(region: string, distance: RunningDistanceOption) {
  return apiRequest<RunningRecommendation>(
    `/api/running/courses/recommend?region=${encodeURIComponent(region)}&distance_option=${distance}`,
  );
}

export function getRunningCourseDetail(courseId: string) {
  return apiRequest<{ course?: RunningCourse } & RunningCourse>(
    `/api/running/courses/${encodeURIComponent(courseId)}`,
  );
}

export function previewRunningRoute(input: {
  start: RunningCoordinate;
  end: RunningCoordinate;
  waypoints: RunningCoordinate[];
}) {
  return apiRequest<RunningRoutePreview>('/api/running/routes/preview', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function getSavedRunningCourses() {
  return apiRequest<{ courses: RunningSavedCourse[] }>('/api/running/saved-courses');
}

export function saveRunningCourse(input: {
  snapshot: RunningCourse;
  selection_token: string;
  preview?: RunningRoutePreview;
  accept_distance_error?: boolean;
}) {
  const { selection_token: _courseToken, ...snapshot } = input.snapshot;
  const { preview_token, ...preview } = input.preview ?? {};
  return apiRequest<RunningSavedCourse>('/api/running/saved-courses', {
    method: 'POST', body: JSON.stringify({
      snapshot, selection_token: input.selection_token,
      ...(input.preview ? { preview, preview_token } : {}),
      accept_distance_error: input.accept_distance_error ?? false,
      is_selected: true,
    }),
  });
}

export function setRunningCourseFavorite(savedId: string, favorite: boolean) {
  return apiRequest<RunningSavedCourse>(
    `/api/running/saved-courses/${encodeURIComponent(savedId)}/favorite`,
    { method: 'PATCH', body: JSON.stringify({ is_favorite: favorite }) },
  );
}

export type RunningSession = {
  running_session_id: string;
  status: 'in_progress' | 'paused' | 'completed' | 'discarded';
  started_at: string;
  ended_at?: string | null;
  elapsed_seconds: number;
  distance_meters: number;
  average_pace_seconds_per_km: number | null;
  calories_burned: number;
};

export type RunningTrackPoint = {
  sequence_number: number;
  latitude: number;
  longitude: number;
  cumulative_distance_meters: number;
  elapsed_seconds: number;
  recorded_at: string;
};
export type RunningPlannedCourse = {
  name: string;
  path: RunningCoordinate[];
  target_distance_meters: number;
};

export type StartFreeRunInput = {
  target_distance_meters: number;
  target_duration_seconds: number;
  region_name: string | null;
  condition_level: 'good' | 'normal' | 'tired';
  intensity: 'light' | 'moderate' | 'hard';
  discomfort_areas: string[];
};

export function getActiveRunningSession() {
  return apiRequest<{ session: RunningSession | null }>('/api/running/sessions/active');
}

export function getRunningHistory(from?: string, to?: string) {
  const query = from && to
    ? `?limit=1000&from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}`
    : '?limit=30';
  return apiRequest<{ sessions: RunningSession[] }>(`/api/running/sessions/history${query}`);
}

export function startFreeRun(input: StartFreeRunInput) {
  return apiRequest<{ session: RunningSession }>('/api/running/sessions', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function startSavedCourseRun(input: {
  saved_course_id: string;
  target_duration_seconds: number;
  condition_level: 'good' | 'normal' | 'tired';
  intensity: 'light' | 'moderate' | 'hard';
}) {
  return apiRequest<{ session: RunningSession }>('/api/running/sessions/from-saved-course', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function getRunningSession(id: string) {
  return apiRequest<{ session: RunningSession; points: RunningTrackPoint[]; planned_course?: RunningPlannedCourse | null }>(
    `/api/running/sessions/${encodeURIComponent(id)}`,
  );
}

export function addRunningTrackPoint(id: string, point: {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  elapsed_seconds: number;
}) {
  return apiRequest<{ accepted: boolean; reason?: string; session: RunningSession; point?: RunningTrackPoint }>(
    `/api/running/sessions/${encodeURIComponent(id)}/points`, {
      method: 'POST', body: JSON.stringify(point),
    },
  );
}

export function pauseRunningSession(id: string, elapsedSeconds: number) {
  return apiRequest<{ session: RunningSession }>(
    `/api/running/sessions/${encodeURIComponent(id)}/pause`, {
      method: 'POST', body: JSON.stringify({ elapsed_seconds: elapsedSeconds }),
    },
  );
}

export function resumeRunningSession(id: string) {
  return apiRequest<{ session: RunningSession }>(
    `/api/running/sessions/${encodeURIComponent(id)}/resume`, {
      method: 'POST', body: JSON.stringify({}),
    },
  );
}

export function completeRunningSession(id: string, elapsedSeconds: number) {
  return apiRequest<{ session: RunningSession }>(
    `/api/running/sessions/${encodeURIComponent(id)}/complete`, {
      method: 'POST', body: JSON.stringify({ elapsed_seconds: elapsedSeconds }),
    },
  );
}
