import type { WeeklyDay, WeeklyPlan } from '@/src/api/diet';
import { readAllergySafety, type AllergySafety } from '@/src/features/diet/allergyConflict';
import { plainFoodName } from '@/src/features/diet/foodName';
import { weeklyDayFor } from '@/src/features/diet/weeklyMeals';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ApiRecord = Record<string, unknown>;
export type MealStatus = 'recommended' | 'eaten' | 'modified' | 'skipped';
type MacroItem = { carbs?: number; protein?: number; fat?: number };

export type Meal = {
  allergySafety?: AllergySafety;
  description?: string;
  macroItems: MacroItem[];
  dietMealId?: string;
  imageUrl?: string;
  recommendationStatus?: MealStatus;
  sourceType?: string;
  variantId: string;
  weekly?: { planId: string; day: WeeklyDay };
  id: MealType;
  title: string;
  kcal: number | null;
  foods: string;
  tags: string[];
  note: string;
  usedIngredients: string[];
  intake: [string, string][];
  macros: string;
};

const mealPresentation: Record<MealType, string> = {
  breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식',
};

export function isApiRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function readString(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function readNumber(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function readMealType(value: unknown): MealType | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value.trim().toLowerCase()) {
    case 'breakfast':
    case 'morning':
    case '아침':
      return 'breakfast';
    case 'lunch':
    case 'noon':
    case '점심':
      return 'lunch';
    case 'dinner':
    case 'evening':
    case '저녁':
      return 'dinner';
    case 'snack':
    case '간식':
      return 'snack';
    default:
      return undefined;
  }
}

function foodName(food: unknown) {
  if (typeof food === 'string') return food.trim();
  if (!isApiRecord(food)) return '';
  return readString(food, ['food_name', 'name', 'title', 'display_name']) ?? '';
}

function foodAmount(food: unknown) {
  if (!isApiRecord(food)) return '';
  const quantity = readNumber(food, ['quantity', 'amount', 'serving_size', 'serving']);
  const unit = readString(food, ['unit', 'quantity_unit', 'serving_unit']);
  if (quantity === undefined && !unit) return '';
  const displayQuantity =
    unit === 'g' && quantity !== undefined && quantity >= 10
      ? Math.round(quantity / 10) * 10
      : quantity;
  return `${displayQuantity ?? ''}${unit ?? ''}`.trim();
}

export function macroLabel(items: MacroItem[], names = ['탄', '단', '지'], separator = ' ') {
  const total = (key: keyof MacroItem, label: string) =>
    items.some((item) => item[key] !== undefined)
      ? `${label} ${Math.round(items.reduce((sum, item) => sum + (item[key] ?? 0), 0))}g`
      : null;
  return [total('carbs', names[0]), total('protein', names[1]), total('fat', names[2])].filter(Boolean).join(separator);
}

function recommendationStatusToMealStatus(value: unknown): MealStatus {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case 'completed':
      return 'eaten';
    case 'changed':
      return 'modified';
    case 'skipped':
      return 'skipped';
    case 'recommended':
    default:
      return 'recommended';
  }
}

export function mapRecommendationMeals(result: unknown): Meal[] {
  if (!isApiRecord(result)) return [];

  const nestedRecommendation = isApiRecord(result.recommendation)
    ? result.recommendation
    : undefined;
  const apiMeals = readArray(result.meals ?? nestedRecommendation?.meals);
  const mappedByType = new Map<MealType, Meal>();

  apiMeals.forEach((apiMeal, index) => {
    if (!isApiRecord(apiMeal)) return;

    const mealId = readMealType(
      readString(apiMeal, ['meal_type', 'meal_category', 'type', 'time_of_day']),
    );
    const dietMealId = readString(apiMeal, ['diet_meal_id', 'id']);
    const foods = readArray(apiMeal.foods ?? apiMeal.items);
    if (!mealId || !dietMealId || mappedByType.has(mealId)) return;

    const foodNames = foods.map(foodName).filter(Boolean);
    const foodCalories = foods.reduce((sum, food) => {
      if (!isApiRecord(food)) return sum;
      return sum + (readNumber(food, ['calories', 'kcal', 'energy_kcal']) ?? 0);
    }, 0);
    const kcal =
      readNumber(apiMeal, [
        'recommended_calories',
        'calories',
        'kcal',
        'total_calories',
        'energy_kcal',
      ]) ?? (foods.some((food) => isApiRecord(food) && readNumber(food, ['calories', 'kcal', 'energy_kcal']) !== undefined) ? foodCalories : null);

    const macroItems = foods.filter(isApiRecord).map((food) => ({
      carbs: readNumber(food, ['carbohydrates', 'carbs']),
      fat: readNumber(food, ['fat']),
      protein: readNumber(food, ['protein']),
    }));

    mappedByType.set(mealId, {
      allergySafety: readAllergySafety(apiMeal.allergy_safety),
      dietMealId,
      foods: plainFoodName(foodNames.join(' · ')) || '등록된 음식이 없어요',
      macroItems,
      macros: macroLabel(macroItems),
      id: mealId,
      imageUrl: readString(apiMeal, ['image_url']),
      intake: foods
        .map((food) => [foodName(food), foodAmount(food)] as [string, string])
        .filter(([name]) => Boolean(name)),
      kcal: kcal == null ? null : Math.round(kcal),
      note: readString(apiMeal, ['recommendation_note', 'note', 'description', 'comment']) ?? '',
      recommendationStatus: recommendationStatusToMealStatus(readString(apiMeal, ['status'])),
      sourceType: readString(apiMeal, ['source_type']),
      tags: readArray(apiMeal.tags).filter((tag): tag is string => typeof tag === 'string'),
      title: mealPresentation[mealId],
      usedIngredients: readArray(apiMeal.used_ingredients ?? apiMeal.ingredients)
        .map(foodName)
        .filter(Boolean),
      variantId: dietMealId || `api-meal-${index}`,
    });
  });

  const mappedMeals = (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[])
    .map((mealId) => mappedByType.get(mealId))
    .filter((meal): meal is Meal => Boolean(meal));

  return mappedMeals;
}

export function mapWeeklyMeals(plan: WeeklyPlan | null, dateKey: string): Meal[] {
  const entry = weeklyDayFor(plan, dateKey);
  if (!plan || !entry) return [];
  return (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).flatMap((id) => {
    const meal = entry.meals[id];
    if (!meal) return [];
    const macroItems = [{ carbs: meal.nutrition.carbohydrate_g, fat: meal.nutrition.fat_g, protein: meal.nutrition.protein_g }];
    return [{
      description: meal.menu_description,
      foods: plainFoodName(meal.menu_name),
      id,
      intake: meal.items.map((item) => [item.food_name, `${item.portion_g}g`] as [string, string]),
      kcal: Math.round(meal.estimated_calories_kcal),
      macroItems,
      macros: macroLabel(macroItems),
      note: meal.guidance ?? '',
      tags: [],
      title: mealPresentation[id],
      usedIngredients: [],
      variantId: `weekly-${entry.date}-${id}`,
      weekly: { planId: plan.weekly_diet_plan_id, day: entry.day },
    }];
  });
}
