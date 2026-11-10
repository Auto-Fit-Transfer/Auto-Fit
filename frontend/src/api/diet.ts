import { ApiError, apiRequest, getApiErrorMessage } from '@/src/api/client';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import type { FoodShotResponse } from '@/src/features/diet/foodShot';
import { weeklyDietErrorMessage } from '@/src/features/diet/weeklyDietErrors';

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

export type DietFeedbackInput = {
  actualItems?: DietActualItem[];
  eatenAt?: string | null;
  feedbackType: DietFeedbackType;
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

export type DietMealPhotoResponse = {
  meal_log_id: string;
  image_storage_path: string;
  image_url: string;
  image_url_expires_in: number;
};

export type DietMealPhotoInput = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

const supportedMealPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getMealPhotoUploadMetadata(photo: DietMealPhotoInput) {
  const normalizedMimeType = photo.mimeType?.trim().toLowerCase();
  const path = photo.uri.split(/[?#]/, 1)[0].toLowerCase();
  const inferredMimeType = path.endsWith('.png')
    ? 'image/png'
    : path.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  const mimeType = normalizedMimeType || inferredMimeType;

  if (!supportedMealPhotoTypes.has(mimeType)) {
    throw new Error('JPEG, PNG, WebP 형식의 사진만 등록할 수 있어요.');
  }

  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = photo.fileName?.trim() || `meal-photo-${Date.now()}.${extension}`;
  return { extension, fileName, mimeType };
}

export async function uploadDietMealPhoto(
  mealLogId: string,
  photo: DietMealPhotoInput,
) {
  const { fileName, mimeType } = getMealPhotoUploadMetadata(photo);
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error('선택한 사진을 불러오지 못했어요.');
    formData.append('file', await response.blob(), fileName);
  } else {
    formData.append(
      'file',
      {
        name: fileName,
        type: mimeType,
        uri: photo.uri,
      } as unknown as Blob,
    );
  }

  return apiRequest<DietMealPhotoResponse>(
    `/api/diet/meal-logs/${encodeURIComponent(mealLogId)}/photo`,
    {
      body: formData,
      method: 'POST',
    },
  );
}

// Paid on the server (OpenAI Vision) per call, so the app runs it only on the user's tap and never retries.
export async function analyzeFoodShot(photo: DietMealPhotoInput) {
  const { fileName } = getMealPhotoUploadMetadata(photo);
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error('선택한 사진을 불러오지 못했어요.');
    formData.append('file', await response.blob(), fileName);
  } else {
    formData.append('file', new File(photo.uri), fileName);
  }
  return apiRequest<FoodShotResponse>('/api/diet/food-shots/analyze', { body: formData, method: 'POST' });
}

// Official catalog lookup only (no AI), for foods the user named or weighed.
export function recalculateFoodShot(items: { name: string; amount_g: number; matched_food_code?: string }[]) {
  return apiRequest<FoodShotResponse>('/api/diet/food-shots/recalculate', { body: JSON.stringify({ items }), method: 'POST' });
}

export function getLatestDietRecommendations() {
  return apiRequest<DietRecommendationResponse>('/api/diet/recommendations/latest');
}

export function getDietRecommendationsByDate(date: string) {
  const params = new URLSearchParams({ date });
  return apiRequest<DietRecommendationResponse>(`/api/diet/recommendations?${params.toString()}`);
}

export type DietRecipeSnapshot = {
  diet_recipe_snapshot_id: string;
  diet_meal_id: string;
  title: string;
  description: string;
  servings: number | string;
  prep_minutes: number | null;
  ingredients: unknown[];
  steps: unknown[];
  generator: string;
  created_at: string;
};

export function getDietMealRecipe(dietMealId: string) {
  return apiRequest<{ recipe: DietRecipeSnapshot | null }>(
    `/api/diet/meals/${encodeURIComponent(dietMealId)}/recipe`,
  );
}

export type WeeklyDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type WeeklyMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type WeeklyNutrition = { carbohydrate_g: number; protein_g: number; fat_g: number };
export type WeeklyFoodItem = WeeklyNutrition & { food_name: string; portion_g: number; calories_kcal: number };
export type WeeklyMeal = {
  menu_name: string;
  menu_description: string;
  estimated_calories_kcal: number;
  nutrition: WeeklyNutrition;
  items: WeeklyFoodItem[];
  guidance: string | null;
};
export type WeeklyPlan = {
  ok: true;
  weekly_diet_plan_id: string;
  week_start_date: string;
  timezone: 'Asia/Seoul';
  version: number;
  result: {
    summary: string;
    strategy: string;
    weekly_plan: { day: WeeklyDay; date: string; meals: Record<WeeklyMealType, WeeklyMeal> }[];
  };
};

export function getWeeklyDiet(weekStartDate: string) {
  return apiRequest<WeeklyPlan>(`/api/diet/weekly-recommendations?week_start_date=${encodeURIComponent(weekStartDate)}`);
}

export function generateWeeklyDiet(weekStartDate: string, expectedVersion?: number) {
  return apiRequest<WeeklyPlan>('/api/diet/weekly-recommendations/generate', {
    method: 'POST',
    body: JSON.stringify({ week_start_date: weekStartDate, ...(expectedVersion ? { expected_version: expectedVersion } : {}) }),
  });
}

export function regenerateWeeklyDietMeal(planId: string, day: WeeklyDay, mealType: WeeklyMealType, expectedVersion: number) {
  return apiRequest<WeeklyPlan>(`/api/diet/weekly-recommendations/${encodeURIComponent(planId)}/meals/${day}/${mealType}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ expected_version: expectedVersion }),
  });
}

export type WeeklyRecipeDetail = {
  recipe_id: string | null;
  menu_name: string | null;
  cooking_method: string | null;
  dish_type: string | null;
  serving_weight: number | null;
  servings: number;
  estimated_duration_minutes: number | null;
  ingredients_text: string | null;
  ingredients: { name: string; amount_g: number | null }[] | null;
  steps: string[];
  step_details: { order: number; instruction: string; duration_minutes: number | null; tip: string | null }[];
  cooking_tip: string | null;
  image_small: string | null;
  image_large: string | null;
  source: string | null;
};
export type WeeklyRecipeItem = WeeklyFoodItem & {
  recipe_available: boolean;
  recipe_source: 'official_exact' | 'official_similar' | 'llm_generated' | 'unavailable';
  official_recipe: boolean;
  matched_recipe_name: string | null;
  match_score: number | null;
  safety_checked: boolean;
  restriction_matches: string[];
  recipe: WeeklyRecipeDetail | null;
};
export type WeeklyRecipe = {
  ok: true;
  meal: {
    day: WeeklyDay | null;
    meal_type: WeeklyMealType | null;
    menu_name: string | null;
    menu_description: string;
    tags: string[];
    servings: number;
    estimated_duration_minutes: number | null;
    estimated_calories_kcal: number;
    nutrition: WeeklyNutrition;
    daily_target_percentages: { calories_percent: number; carbohydrate_percent: number; protein_percent: number; fat_percent: number } | null;
    personalization_reasons: string[];
    allergen_notice: string[];
    items: WeeklyRecipeItem[];
    related_menus: { menu_name: string; day: WeeklyDay | null; meal_type: WeeklyMealType | null; estimated_calories_kcal: number | null }[];
  };
};

export function getWeeklyDietRecipe(planId: string, day: WeeklyDay, mealType: WeeklyMealType, servings: number) {
  return apiRequest<WeeklyRecipe>(`/api/diet/weekly-recommendations/${encodeURIComponent(planId)}/meals/${day}/${mealType}/recipe?servings=${servings}`);
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

  return apiRequest<DietFeedbackResponse>(
    `/api/diet/meals/${encodeURIComponent(dietMealId)}/feedback`,
    {
      body: JSON.stringify(requestBody),
      method,
    },
  );
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
    const message = weeklyDietErrorMessage(error.detail);
    if (message) return message;
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
