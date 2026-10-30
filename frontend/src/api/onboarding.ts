import { ApiError, apiRequest } from '@/src/api/client';

export type ExerciseGoalType =
  'weight_loss' | 'muscle_gain' | 'endurance' | 'maintenance' | 'rehabilitation' | 'other';
export type ExerciseExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type OnboardingStatusResponse = {
  completed: boolean;
};

interface ProfileInput {
  name?: string;
  birthDate: string;
  gender: 'male' | 'female';
}

interface AllergyCatalogItem {
  allergy_type_id?: unknown;
  id?: unknown;
  code?: unknown;
  slug?: unknown;
  name?: unknown;
  name_ko?: unknown;
  label?: unknown;
}

interface AllergiesResponse {
  catalog?: AllergyCatalogItem[];
}

const allergyAliases: Record<string, string[]> = {
  milk: ['milk', '우유'],
  egg: ['egg', 'eggs', '계란'],
  peanut: ['peanut', '땅콩'],
  nuts: ['nuts', 'tree nuts', '견과류'],
  wheat: ['wheat', 'gluten', '밀', '밀(글루텐)'],
  buckwheat: ['buckwheat', '메밀'],
  soybean: ['soybean', 'soy', '대두', '콩', '콩(대두)'],
  peach: ['peach', '복숭아'],
  fish: ['fish', '생선'],
  crab: ['crab', 'crustacean', '갑각류'],
  shellfish: ['shellfish', 'clam', '조개', '조개류'],
  sesame: ['sesame', '참깨'],
};

const normalize = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase().replace(/\s+/g, ' ') : '';

function getCatalogId(item: AllergyCatalogItem) {
  const value = item.allergy_type_id ?? item.id;
  return typeof value === 'string' ? value : undefined;
}

function catalogMatches(item: AllergyCatalogItem, allergen: string) {
  const catalogValues = [item.code, item.slug, item.name, item.name_ko, item.label]
    .map(normalize)
    .filter(Boolean);
  return (allergyAliases[allergen] ?? [allergen]).some((alias) =>
    catalogValues.includes(normalize(alias)),
  );
}

export async function saveProfile({ name, birthDate, gender }: ProfileInput) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      ...(name === undefined ? {} : { name }),
      birth_date: birthDate,
      gender,
    }),
  });
}

export function saveTargetWeight(targetWeight: number) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({ target_weight: targetWeight }),
  });
}

export async function saveAllergies(selectedAllergens: string[], otherAllergy: string) {
  let allergyTypeIds: string[] = [];

  if (selectedAllergens.length > 0) {
    const response = await apiRequest<AllergiesResponse>('/api/allergies');
    const catalog = Array.isArray(response.catalog) ? response.catalog : [];

    allergyTypeIds = selectedAllergens.map((allergen) => {
      const item = catalog.find((candidate) => catalogMatches(candidate, allergen));
      const id = item && getCatalogId(item);
      if (!id) {
        // The API spec defines catalog[] but not its exact response field names.
        throw new Error(`서버 알레르기 목록에서 '${allergen}' 항목을 찾지 못했습니다.`);
      }
      return id;
    });
  }

  const customName = otherAllergy.trim();
  return apiRequest('/api/allergies', {
    method: 'PUT',
    body: JSON.stringify({
      allergy_type_ids: allergyTypeIds,
      custom_names: customName ? [customName] : [],
    }),
  });
}

export async function saveExercisePreferences(
  goalType: ExerciseGoalType,
  experienceLevel: ExerciseExperienceLevel,
  customGoal: string | null,
) {
  return apiRequest('/api/exercise/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      goal_type: goalType,
      custom_goal: customGoal,
      experience_level: experienceLevel,
    }),
  });
}

export async function completeOnboarding() {
  return apiRequest('/api/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getOnboardingStatus() {
  return apiRequest<OnboardingStatusResponse>('/api/onboarding/status');
}

export function getSignupApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 0) return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    if (error.status === 401) return '인증이 만료되었습니다. 이메일 인증부터 다시 진행해 주세요.';
    if (error.status === 409)
      return '이미 저장되었거나 현재 상태와 충돌했습니다. 잠시 후 다시 시도해 주세요.';
    if (error.status === 422) return '입력한 정보를 다시 확인해 주세요.';
  }
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
}
