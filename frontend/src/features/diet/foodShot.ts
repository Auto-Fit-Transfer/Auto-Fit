// FoodShot rules (back-end docs/food-shot-api-contract.md). The result is a suggestion the user confirms;
// nothing here saves a meal.

export type FoodShotItem = {
  name: string;
  amount_g: number | null;
  catalog_matched: boolean;
  matched_food_code?: string | null;
  calories_kcal: number | null;
  carbohydrate_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
};

export type FoodShotResponse = {
  status: 'completed' | 'partial' | 'unavailable';
  items: FoodShotItem[];
  nutrition_complete: boolean;
  message: string;
};

type Food = {
  id: string; name: string; serving: number; amount: number; unit: string; baseAmount?: number; isCustom?: boolean;
  kcal?: number; carbs?: number; protein?: number; fat?: number;
};

const value = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined);

// Missing nutrition stays missing (undefined): the review asks the user to fix it instead of counting it as 0.
export function foodShotFoods(response: FoodShotResponse, idPrefix = 'shot'): Food[] {
  if (response.status === 'unavailable') return [];
  return response.items.map((item, index) => {
    const amount = item.amount_g && item.amount_g > 0 ? Math.round(item.amount_g) : 0;
    return {
      id: `${idPrefix}-${index}`,
      name: item.name,
      serving: amount ? 1 : 0,
      amount,
      baseAmount: amount || 300,
      unit: 'g',
      isCustom: !item.catalog_matched,
      kcal: value(item.calories_kcal),
      carbs: value(item.carbohydrate_g),
      protein: value(item.protein_g),
      fat: value(item.fat_g),
    };
  });
}

// Only a food with no nutrition yet, a gram amount and a name goes to the free catalog recalculation.
export function needsRecalculation(food: Pick<Food, 'name' | 'amount' | 'unit' | 'kcal'>) {
  return food.kcal === undefined && food.amount > 0 && food.amount <= 5000 && food.unit === 'g' && food.name.trim().length > 0;
}

export function withRecalculated<T extends Food>(food: T, response: FoodShotResponse): T {
  const [item] = response.items;
  if (!item || item.calories_kcal == null) return food;
  return { ...food, kcal: value(item.calories_kcal), carbs: value(item.carbohydrate_g), protein: value(item.protein_g), fat: value(item.fat_g) };
}

export const hasMissingNutrition = (foods: Pick<Food, 'kcal'>[]) => foods.some((food) => food.kcal === undefined);

export function foodShotErrorText(status: number, detail: unknown): string {
  const code = (detail as { code?: unknown } | null)?.code;
  if (status === 413 || code === 'FOOD_SHOT_TOO_LARGE') return '사진이 너무 커요. 다른 사진을 골라 주세요.';
  if (status === 415 || code === 'UNSUPPORTED_IMAGE_TYPE') return 'JPEG, PNG, WebP 사진만 분석할 수 있어요.';
  if (status === 422) return '이 사진은 분석할 수 없어요. 음식이 잘 보이는 사진으로 다시 해 주세요.';
  if (status === 429) return '잠시 뒤 다시 시도해 주세요.';
  if (status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
  return '지금은 사진을 분석하지 못했어요. 음식 이름으로 찾아 기록할 수 있어요.';
}

// Why a food still has no nutrition, in words the user can act on. tried: false = nothing was asked yet (no grams),
// 'not_found' = the catalog has no such food, a number = the request failed with that HTTP status (0 = no connection).
export function missingNutritionNote(food: Pick<Food, 'name' | 'amount' | 'unit'>, tried: false | 'not_found' | number): string {
  const name = `‘${food.name.trim() || '이 음식'}’`;
  if (tried === false) {
    return food.unit === 'g' && food.amount > 5000
      ? `${name} 양을 5,000g 이하로 입력하면 영양 정보를 찾아볼게요.`
      : `${name} 양을 g으로 입력하면 영양 정보를 찾아볼게요.`;
  }
  if (tried === 'not_found') return `${name} 영양 정보를 찾지 못했어요. 이름을 바꾸거나 영양 정보를 직접 입력해 주세요.`;
  if (tried === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
  if (tried === 0) return `연결 문제로 ${name} 영양 정보를 찾지 못했어요. 음식을 눌러 다시 저장해 주세요.`;
  if (tried === 429) return `요청이 많아 ${name} 영양 정보를 찾지 못했어요. 잠시 뒤 음식을 눌러 다시 저장해 주세요.`;
  return `지금은 ${name} 영양 정보를 찾지 못했어요. 잠시 뒤 음식을 눌러 다시 저장하거나 영양 정보를 직접 입력해 주세요.`;
}
