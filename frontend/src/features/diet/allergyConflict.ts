// Saved meals are shown again after the user's allergies change, so the screen re-checks them by name.
// Mirrors ALLERGY_ALIASES and conflicts_allergy in back-end backend/app/diet_ai.py; keep the two in step.
// shortcut: names cannot reveal hidden ingredients, so no match never means safe; drop this when the API returns a per-meal allergy result.
const ALLERGY_ALIASES: Record<string, string[]> = {
  우유: ['요거트', '치즈', '버터'],
  유제품: ['우유', '요거트', '치즈', '버터'],
  milk: ['yogurt', 'cheese', 'butter'],
  dairy: ['milk', 'yogurt', 'cheese', 'butter'],
  대두: ['두부', '콩', '된장'],
  soy: ['tofu', 'soybean'],
  견과류: ['호두', '아몬드', '땅콩', '캐슈'],
  생선: ['연어', '고등어', '참치', '대구'],
  fish: ['salmon', 'tuna', 'cod'],
  달걀: ['계란', '메추리알', '에그', '마요네즈'],
  계란: ['달걀', '메추리알', '에그', '마요네즈'],
  egg: ['달걀', '계란', '메추리알', '에그', '마요네즈'],
  갑각류: ['새우', '게', '꽃게', '대게', '가재', '랍스터', '크랩'],
  새우: ['갑각류', 'shrimp', 'prawn'],
  crustacean: ['새우', '게', '가재', '랍스터', 'shrimp', 'crab', 'lobster'],
  밀: ['밀가루', '빵', '면', '국수', '라면', '우동', '파스타', '쿠키', '케이크'],
  wheat: ['밀', '밀가루', '빵', '면', '국수', '라면', '우동', '파스타', 'bread', 'noodle'],
};

export function conflictsAllergy(foodName: string, allergyName: string) {
  const food = foodName.trim().toLowerCase();
  const allergy = allergyName.trim().toLowerCase();
  if (!food || !allergy) return false;
  if (food.includes(allergy) || allergy.includes(food)) return true;
  return (ALLERGY_ALIASES[allergy] ?? []).some((alias) => food.includes(alias.toLowerCase()));
}

type AllergyLists = {
  catalog: { allergy_type_id: string; name: string }[];
  selected: { allergy_type_id: string | null; custom_name: string | null }[];
};

// Same names the backend uses when it builds a meal plan: the custom name, else the catalog name.
export function allergyNamesFrom({ catalog, selected }: AllergyLists) {
  const names = new Map(catalog.map((type) => [type.allergy_type_id, type.name]));
  return selected
    .map((row) => (row.custom_name || (row.allergy_type_id ? names.get(row.allergy_type_id) : '') || '').trim())
    .filter(Boolean);
}

type MealNames = { foods: string; intake: [string, string][]; usedIngredients: string[] };

// The allergies a meal's menu, foods or ingredients run into.
export function mealAllergyConflicts(meal: MealNames, allergyNames: string[]) {
  const names = [meal.foods, ...meal.intake.map(([name]) => name), ...meal.usedIngredients];
  return allergyNames.filter((allergy) => names.some((name) => conflictsAllergy(name, allergy)));
}

export function allergyWarning(conflicts: string[]) {
  return `${conflicts.join(', ')} 알레르기와 겹치는 재료가 있어요. 이 메뉴는 드시지 마세요.`;
}

// The API's re-check of a saved daily meal against the current allergies.
export type AllergySafety = { status: string; matchedFoodNames: string[] };

export function readAllergySafety(value: unknown): AllergySafety | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { status, matched_food_names: names } = value as { status?: unknown; matched_food_names?: unknown };
  if (typeof status !== 'string') return undefined;
  return {
    status,
    matchedFoodNames: Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : [],
  };
}

export type MealAllergyNotice = { blocked: boolean; regenerateDay: boolean; message: string };

// The API's answer wins; the name check only covers meals it does not judge, such as weekly ones.
export function mealAllergyNotice(
  meal: MealNames & { allergySafety?: AllergySafety },
  allergyNames: string[],
): MealAllergyNotice | null {
  const safety = meal.allergySafety;
  if (!safety) {
    const conflicts = mealAllergyConflicts(meal, allergyNames);
    return conflicts.length > 0 ? { blocked: true, regenerateDay: false, message: allergyWarning(conflicts) } : null;
  }
  switch (safety.status) {
    case 'no_selected_allergies':
      return null;
    case 'ingredients_unverified':
      return { blocked: false, regenerateDay: false, message: '전체 재료는 확인되지 않았어요.' };
    case 'conflict': {
      const names = safety.matchedFoodNames.map((name) => name.replace(/_/g, ' ')).join(', ');
      return {
        blocked: true,
        regenerateDay: true,
        message: `현재 알레르기와 겹치는 음식이 있어요${names ? `: ${names}` : ''}. 이 메뉴는 드시지 마세요.`,
      };
    }
    case 'context_changed':
      return { blocked: true, regenerateDay: true, message: '알레르기 설정이 바뀐 뒤 확인되지 않은 식단이에요. 이 메뉴는 사용할 수 없어요.' };
    default: // context_unverified, and any status this app version does not know yet.
      return { blocked: true, regenerateDay: true, message: '이 식단은 알레르기 정보를 다시 확인할 수 없어요. 이 메뉴는 사용할 수 없어요.' };
  }
}
