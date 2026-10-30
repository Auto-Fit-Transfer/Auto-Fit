import { apiRequest } from '@/src/api/client';

export type HealthGoalType = 'fat_loss' | 'muscle_gain' | 'fitness' | 'maintenance' | 'other';
export type HealthGoal = {
  user_health_goal_id: string;
  goal_type: HealthGoalType;
  goal_text: string | null;
  target_date: string | null;
  updated_at: string;
};
export type HealthGoalInput = Pick<HealthGoal, 'goal_type' | 'goal_text'>;

export function getActiveHealthGoal() {
  return apiRequest<{ goal: HealthGoal | null }>('/api/health/goals/active', { method: 'GET' });
}

export function saveActiveHealthGoal(input: HealthGoalInput) {
  return apiRequest<{ goal: HealthGoal }>('/api/health/goals/active', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export type DisplayPreferences = {
  theme_mode: 'system' | 'light' | 'dark';
  font_size_step: 1 | 2 | 3 | 4 | 5;
  simple_mode_enabled: boolean;
};

export function getDisplayPreferences() {
  return apiRequest<{ preferences: DisplayPreferences }>('/api/app/preferences', { method: 'GET' });
}

export function saveDisplayPreferences(input: DisplayPreferences) {
  return apiRequest<{ preferences: DisplayPreferences }>('/api/app/preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export type NotificationPreferences = {
  diet_enabled: boolean;
  exercise_enabled: boolean;
  health_report_enabled: boolean;
  community_enabled: boolean;
  push_enabled: boolean;
  foreground_push_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export function getNotificationPreferences() {
  return apiRequest<{ preferences: NotificationPreferences }>('/api/notifications/preferences', { method: 'GET' });
}

export function saveNotificationPreferences(input: NotificationPreferences) {
  return apiRequest<{ preferences: NotificationPreferences }>('/api/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
