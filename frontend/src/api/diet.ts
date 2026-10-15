import { ApiError, apiRequest, getApiErrorMessage } from '@/src/api/client';

type ApiObject = Record<string, unknown>;

export type DietFeedbackType = 'different_food' | 'eaten' | 'skipped';

export type DietActualItem = {
  food_name: string;
  quantity: number | string;
  unit: string;
  calories: number | string | null;
  carbohydrates: number | string | null;
  protein: number | string | null;
  fat: number | string | null;
};

export type CreateInventoryItemInput = {
  expiresOn: string | null;
  name: string;
  purchasedOn: string | null;
  quantity: number | string | null;
  unit: string | null;
};

export type UpdateInventoryItemInput = {
  expiresOn: string | null;
  name: string | null;
  purchasedOn: string | null;
  quantity: number | string | null;
  unit: string | null;
};

export type DietFeedbackInput = {
  actualItems?: DietActualItem[];
  eatenAt?: string | null;
  feedbackType: DietFeedbackType;
};

export type DietInventoryResponse = {
  count?: unknown;
  inventory?: unknown;
};

export type DietRecommendationResponse = {
  result?: ApiObject | null;
};

export type DietMealRegenerationResponse = {
  generator?: unknown;
  meal?: unknown;
  ok?: unknown;
  used_ingredients?: unknown;
};

export type DietFeedbackResponse = {
  ok?: unknown;
  result?: ApiObject | null;
};

export type DietMealLogsResponse = {
  count?: unknown;
  logs?: unknown;
  period?: unknown;
};

export function getDietInventory() {
  return apiRequest<DietInventoryResponse>('/api/diet/inventory');
}

export function createDietInventoryItem(input: CreateInventoryItemInput) {
  return apiRequest<{ item?: unknown; ok?: unknown }>('/api/diet/inventory', {
    body: JSON.stringify({
      expires_on: input.expiresOn,
      name: input.name,
      purchased_on: input.purchasedOn,
      quantity: input.quantity,
      unit: input.unit,
    }),
    method: 'POST',
  });
}

export function updateDietInventoryItem(inventoryId: string, input: UpdateInventoryItemInput) {
  return apiRequest<{ item?: unknown; ok?: unknown }>(
    `/api/diet/inventory/${encodeURIComponent(inventoryId)}`,
    {
      body: JSON.stringify({
        expires_on: input.expiresOn,
        name: input.name,
        purchased_on: input.purchasedOn,
        quantity: input.quantity,
        unit: input.unit,
      }),
      method: 'PATCH',
    },
  );
}

export function deleteDietInventoryItem(inventoryId: string) {
  return apiRequest<void>(`/api/diet/inventory/${encodeURIComponent(inventoryId)}`, {
    method: 'DELETE',
  });
}

export function getLatestDietRecommendations() {
  return apiRequest<DietRecommendationResponse>('/api/diet/recommendations/latest');
}

export function getDietRecommendationsByDate(date: string) {
  const params = new URLSearchParams({ date });
  return apiRequest<DietRecommendationResponse>(`/api/diet/recommendations?${params.toString()}`);
}

export function getDietNutritionSummary(date: string) {
  const params = new URLSearchParams({ date });
  return apiRequest<{ summary: import('@/src/features/nutritionSummary').NutritionSummary }>(
    `/api/diet/nutrition-summary?${params.toString()}`,
  );
}

export function generateDietRecommendations() {
  return apiRequest<DietRecommendationResponse>('/api/diet/recommendations/generate', {
    body: JSON.stringify({}),
    method: 'POST',
  });
}

function requestDietMealFeedback(
  dietMealId: string,
  input: DietFeedbackInput,
  method: 'PATCH' | 'POST',
) {
  const requestBody = {
    feedback_type: input.feedbackType,
    ...(input.eatenAt !== undefined ? { eaten_at: input.eatenAt } : {}),
    ...(input.actualItems !== undefined ? { actual_items: input.actualItems } : {}),
  };

  if (__DEV__) {
    console.log('[Diet feedback] request:', {
      actual_items: requestBody.actual_items,
      diet_meal_id: dietMealId,
      eaten_at: requestBody.eaten_at,
      feedback_type: requestBody.feedback_type,
      method,
      request_body: requestBody,
    });
  }

  return apiRequest<DietFeedbackResponse>(
    `/api/diet/meals/${encodeURIComponent(dietMealId)}/feedback`,
    {
      body: JSON.stringify(requestBody),
      method,
    },
  ).catch((error: unknown) => {
    if (__DEV__) {
      if (error instanceof ApiError) {
        console.error('[Diet feedback] failure:', {
          detail: error.detail ?? null,
          error: error.code ?? null,
          http_status: error.status,
          message: error.message,
          response_body: error.responseBody ?? null,
        });
      } else {
        console.error('[Diet feedback] failure:', {
          detail: null,
          error: null,
          http_status: null,
          message: error instanceof Error ? error.message : String(error),
          response_body: null,
        });
      }
    }
    throw error;
  });
}

export function submitDietMealFeedback(dietMealId: string, input: DietFeedbackInput) {
  return requestDietMealFeedback(dietMealId, input, 'POST');
}

export function updateDietMealFeedback(dietMealId: string, input: DietFeedbackInput) {
  return requestDietMealFeedback(dietMealId, input, 'PATCH');
}

export function regenerateDietMeal(dietMealId: string) {
  const endpoint = `/api/diet/meals/${encodeURIComponent(dietMealId)}/regenerate`;
  return apiRequest<DietMealRegenerationResponse>(endpoint, {
    body: JSON.stringify({}),
    method: 'POST',
  });
}

export function getDietMealLogs(fromDate: string, toDate: string) {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  return apiRequest<DietMealLogsResponse>(`/api/diet/meal-logs?${params.toString()}`);
}

export function getDietApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
      case 401:
        return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
      case 404:
        return '요청한 식단 정보를 찾지 못했어요.';
      case 409:
        return '이미 처리 중인 요청입니다. 잠시 후 다시 확인해 주세요.';
      case 422:
        return '입력한 식단 정보를 확인해 주세요.';
      default:
        return getApiErrorMessage(error);
    }
  }

  return getApiErrorMessage(error);
}
