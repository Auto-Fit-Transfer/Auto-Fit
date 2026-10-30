import { ApiError, apiRequest, getApiErrorMessage } from '@/src/api/client';
import type { ExerciseAnalysis } from '@/src/features/exercise/exerciseAnalysis';

export function getExerciseSessionAnalysis(sessionId: string) {
  return apiRequest<{ analysis: ExerciseAnalysis }>(
    `/api/exercise/sessions/${encodeURIComponent(sessionId)}/analysis`,
  );
}

export type ExerciseApiLocation = 'gym' | 'home' | 'outdoor' | 'other';
export type ExerciseApiEquipment = 'machine' | 'band' | 'dumbbell' | 'mat' | 'other';

export type ExerciseRecommendationContextInput = {
  availableEquipment: ExerciseApiEquipment[];
  availableMinutes: number;
  conditionLevel: string;
  conditionNote: string | null;
  discomfortAreas: string[];
  location: ExerciseApiLocation;
};

export type ExerciseItemResultInput = {
  completed: boolean;
  completedSets?: number | null;
  durationMinutes?: number | null;
  note?: string | null;
  performedRepetitions?: number | null;
  performedWeightKg?: number | null;
  skipReason?: string | null;
  skipped: boolean;
};

export type ExerciseSessionFeedbackInput = {
  note: string | null;
  perceivedDifficulty: number;
  postCondition: 'very_bad' | 'bad' | 'normal' | 'good' | 'very_good';
  uncomfortableAreas: string[];
};

type ExerciseApiResponse = Record<string, unknown>;

export function getLatestExerciseRecommendation() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/recommendations/latest');
}

export function getLatestExerciseSession() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/sessions/latest');
}

export function getExerciseSessionFeedback(sessionId: string) {
  return apiRequest<ExerciseApiResponse>(
    `/api/exercise/sessions/${encodeURIComponent(sessionId)}/feedback`,
  );
}

export function saveExerciseSessionFeedback(
  sessionId: string,
  input: ExerciseSessionFeedbackInput,
) {
  return apiRequest<ExerciseApiResponse>(
    `/api/exercise/sessions/${encodeURIComponent(sessionId)}/feedback`,
    {
      body: JSON.stringify({
        note: input.note,
        perceived_difficulty: input.perceivedDifficulty,
        post_condition: input.postCondition,
        uncomfortable_areas: input.uncomfortableAreas,
      }),
      method: 'PUT',
    },
  );
}

export function getExerciseSummary() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/summary');
}

export function getActiveExerciseGoal() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/goals/active');
}

export function getExerciseProgress() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/progress?period=week');
}

export function getExercisePreferences() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/preferences');
}

export function saveExerciseRecommendationContext(input: ExerciseRecommendationContextInput) {
  return apiRequest<ExerciseApiResponse>('/api/exercise/recommendation-contexts', {
    body: JSON.stringify({
      available_equipment: input.availableEquipment,
      available_minutes: input.availableMinutes,
      condition_level: input.conditionLevel,
      condition_note: input.conditionNote,
      discomfort_areas: input.discomfortAreas,
      location: input.location,
    }),
    method: 'POST',
  });
}

export function generateExerciseRecommendation() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/recommendations/generate', {
    body: JSON.stringify({}),
    method: 'POST',
  });
}

export function startExerciseSession() {
  return apiRequest<ExerciseApiResponse>('/api/exercise/sessions/start', {
    body: JSON.stringify({}),
    method: 'POST',
  });
}

export function recordExerciseItemResult(
  sessionId: string,
  itemId: string,
  input: ExerciseItemResultInput,
) {
  return apiRequest<ExerciseApiResponse>(
    `/api/exercise/sessions/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}`,
    {
      body: JSON.stringify({
        completed: input.completed,
        completed_sets: input.completedSets,
        duration_minutes: input.durationMinutes,
        note: input.note,
        performed_repetitions: input.performedRepetitions,
        performed_weight_kg: input.performedWeightKg,
        skip_reason: input.skipReason,
        skipped: input.skipped,
      }),
      method: 'POST',
    },
  );
}

export function completeExerciseSession(sessionId: string) {
  return apiRequest<ExerciseApiResponse>(
    `/api/exercise/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      body: JSON.stringify({}),
      method: 'POST',
    },
  );
}

export function getExerciseApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return '운동 정보 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.';
    }

    switch (error.status) {
      case 0:
        return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
      case 401:
        return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
      case 404:
        return '운동 정보를 찾지 못했어요.';
      case 409:
        return '이미 처리 중인 운동 요청이 있어요. 잠시 후 다시 시도해 주세요.';
      case 422:
        return '운동 조건 또는 현재 설정을 다시 확인해 주세요.';
      default:
        return getApiErrorMessage(error);
    }
  }

  return getApiErrorMessage(error);
}

export type ExerciseGoalInput = {
  goal_type: 'weight_loss' | 'muscle_gain' | 'endurance' | 'maintenance' | 'rehabilitation';
  weekly_frequency: number;
  weekly_duration_minutes: number;
  goal_period_weeks: number;
  starts_on?: string;
};
export function saveExerciseGoal(input: ExerciseGoalInput) {
  return apiRequest<{ goal: ExerciseGoalInput }>('/api/exercise/goals/active', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
export function getExerciseHistory(from: string, to: string) {
  return apiRequest<{
    history: { session: Record<string, unknown>; logs: unknown[]; feedback: unknown }[];
  }>(
    '/api/exercise/history?from_date=' +
      encodeURIComponent(from) +
      '&to_date=' +
      encodeURIComponent(to),
  );
}

export type SavedWorkoutItem = {
  user_workout_routine_item_id: string;
  exercise_name: string;
  sequence_order: number;
  sets: number | null;
  repetitions: number | null;
  target_duration_seconds: number | null;
  rest_seconds: number | null;
  instruction: string;
};

export type SavedWorkoutRoutine = {
  user_workout_routine_id: string;
  source_type: 'custom' | 'recommendation';
  source_recommendation_id: string | null;
  name: string;
  description: string;
  updated_at: string;
  items: SavedWorkoutItem[];
};

export function getSavedWorkoutRoutines() {
  return apiRequest<{ routines: SavedWorkoutRoutine[] }>('/api/exercise/saved-routines');
}

export function saveRecommendedWorkout(recommendationId: string, name: string) {
  return apiRequest<{ routine: SavedWorkoutRoutine }>('/api/exercise/saved-routines', {
    method: 'POST',
    body: JSON.stringify({ source_type: 'recommendation', source_recommendation_id: recommendationId, name }),
  });
}

export type CustomWorkoutItemInput = {
  exercise_name: string;
  sets: number | null;
  repetitions: number | null;
  target_duration_seconds: number | null;
  rest_seconds: number | null;
  instruction: string;
};

export function createCustomWorkout(name: string, items: CustomWorkoutItemInput[]) {
  return apiRequest<{ routine: SavedWorkoutRoutine }>('/api/exercise/saved-routines', {
    method: 'POST',
    body: JSON.stringify({ source_type: 'custom', name, items }),
  });
}
