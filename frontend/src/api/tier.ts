import { apiRequest } from '@/src/api/client';

export function awardTierActivity(
  eventCode: 'meal_log' | 'recommended_workout_completed' | 'health_data_uploaded',
  sourceId: string,
) {
  return apiRequest<{ awarded: boolean; reason: string }>(
    `/api/tier/points/${eventCode}/${encodeURIComponent(sourceId)}`,
    { method: 'POST' },
  );
}

export type HabitTierProgress = {
  policy_version: number;
  points: number;
  tier_code: 'CORE' | 'BALANCE' | 'ACTIVE' | 'FIT' | 'PEAK';
  tier_name: string;
  sublevel: 1 | 2 | 3;
  level_start_points: number;
  next_level_points: number | null;
};

export function getHabitTierProgress() {
  return apiRequest<{ progress: HabitTierProgress }>('/api/tier/progress', { method: 'GET' });
}
