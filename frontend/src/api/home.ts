import { ApiError, apiRequest, getApiErrorMessage } from '@/src/api/client';

export type HealthScorePreviewMode = 'change' | 'latest';

export type HealthScorePreviewResponse = {
  answer?: unknown;
};

export type HomeResponse = {
  user_name: string;
  health_score: {
    score: number | null;
    total_score: number;
    assessed_at: string | null;
  };
  score_change: {
    change: number | null;
    previous_score: number | null;
    previous_assessed_at: string | null;
    comparison: string;
    message: string;
  };
};

export type Profile = {
  name?: string | null;
  nickname?: string | null;
  birth_date?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  target_weight?: number | null;
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
};
export type ProfileResponse = { profile?: Profile | null };
export function updateProfile(input: Partial<Profile>) {
  return apiRequest<ProfileResponse>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getHome() {
  return apiRequest<HomeResponse>('/api/home', { method: 'GET' });
}

export function getProfile() {
  return apiRequest<ProfileResponse>('/api/profile', { method: 'GET' });
}

export function getHealthScorePreview(mode: HealthScorePreviewMode, explain: boolean) {
  return apiRequest<HealthScorePreviewResponse>('/api/chats/health-score-preview', {
    body: JSON.stringify({ explain, mode }),
    method: 'POST',
  });
}

export function getProfileName(response: ProfileResponse) {
  const name = response.profile?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

export function getHomeApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return '건강 정보 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.';
    }

    switch (error.status) {
      case 0:
        return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
      case 401:
        return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
      case 404:
        return '건강 점수 정보를 찾지 못했어요.';
      case 422:
        return '건강 점수 요청을 처리하지 못했어요.';
      default:
        return getApiErrorMessage(error);
    }
  }

  return getApiErrorMessage(error);
}
