import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  type ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Right from '@/assets/icons/common/chevrons/Right.svg';
import Bmr from '@/assets/icons/data/BMR.svg';
import Fat from '@/assets/icons/data/Fat.svg';
import LeafFill from '@/assets/icons/deco/Leaf_Fill.svg';
import Plant from '@/assets/icons/deco/Plant.svg';
import FishSimple from '@/assets/icons/food/FishSimple.svg';
import Fridge from '@/assets/icons/feature/Fridge.svg';
import ForkKnife from '@/assets/icons/feature/navigator/Diet.svg';
import Pencil from '@/assets/icons/feature/Pencil_Line.svg';
import Check from '@/assets/icons/system/Check_Fat.svg';
import Prohibit from '@/assets/icons/system/Prohibit.svg';
import { CustomScrollIndicator, useCustomScrollIndicator } from '@/src/components/common';
import {
  FridgeManagerSheets,
  type DietSheet,
  type FridgeIngredient,
} from '@/src/components/diet/FridgeManagerSheets';
import { MealRecordSheets, type MealRecordDraft } from '@/src/components/diet/MealRecordSheets';
import {
  createDietInventoryItem,
  deleteDietInventoryItem,
  getDietApiErrorMessage,
  getDietInventory,
  getDietMealLogs,
  getDietNutritionSummary,
  getDietRecommendationsByDate,
  regenerateDietMeal,
  submitDietMealFeedback,
  updateDietMealFeedback,
  type DietActualItem,
  type DietFeedbackInput,
} from '@/src/api/diet';
import { API_BASE_URL, ApiError } from '@/src/api/client';
import { getProfile, getProfileName } from '@/src/api/home';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from '@/src/components/navigation';
import { colors, fontFamilies } from '@/src/theme';
import { MainHeader } from '@/src/components/main/MainSurface';
import MainLeft from '@/assets/figma/main/065db.svg';
import MainRight from '@/assets/figma/main/ee8d2.svg';
import MainCalendar from '@/assets/figma/main/b1d25.svg';
import MainRefresh from '@/assets/figma/main/b20a8.svg';
import MainEnergy from '@/assets/figma/main/215b8.svg';
import MainSun from '@/assets/figma/main/2f5ce.svg';
import MainMoon from '@/assets/figma/main/75ea4.svg';
import { nutritionNumber, type NutritionSummary } from '@/src/features/nutritionSummary';

const hero = require('@/assets/figma/main/9dc37.png');
const breakfastImage = require('../../assets/images/illustrations/temp/Image_MealPicture_1.png');
const emptyFoodImage = require('../../assets/images/illustrations/diet/EmptyFood.png');
const lunchImage = breakfastImage;
const dinnerImage = require('../../assets/images/illustrations/temp/Image_MealPicture_2.png');
const snackImage = require('../../assets/images/illustrations/temp/Image_MealPicture_3.png');

const referenceWidth = 412;
const dateWindowMin = -6;
const dateWindowMax = 6;
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type MealStatus = 'recommended' | 'eaten' | 'modified' | 'skipped';
type MealStatuses = Record<MealType, MealStatus>;

type Meal = {
  dietMealId?: string;
  imageUrl?: string;
  recommendationStatus?: MealStatus;
  sourceType?: string;
  variantId: string;
  id: MealType;
  title: string;
  kcal: number;
  color: string;
  image: ImageSourcePropType;
  foods: string;
  tags: string[];
  note: string;
  usedIngredients: string[];
  intake: [string, string][];
};

type NutritionGoal = {
  targetKey: NutritionTargetKey;
  label: string;
  current: number | null;
  target: number | null;
  unit: string;
  Icon: typeof Bmr;
  accentColor: string;
  softColor: string;
};

type NutritionTargetKey = 'calories' | 'carbohydrates' | 'fat' | 'protein';
type RecommendationNutritionTargets = Partial<Record<NutritionTargetKey, number>>;

const defaultMealStatuses: MealStatuses = {
  breakfast: 'recommended',
  lunch: 'recommended',
  dinner: 'recommended',
  snack: 'recommended',
};

const meals: Meal[] = [
  {
    variantId: 'breakfast-default',
    id: 'breakfast',
    title: '아침',
    kcal: 480,
    color: '#7866F4',
    image: breakfastImage,
    foods: '현미밥, 연어구이, 두부샐러드, 미역국, 키위',
    tags: ['근육 유지', '혈당 관리', '식이섬유'],
    note: '연어와 두부로 단백질을 보충하고 혈당 부담을 낮춘 구성',
    usedIngredients: ['두부', '현미밥', '토마토'],
    intake: [
      ['현미밥', '1공기 (약 150g)'],
      ['연어구이', '1토막 (약 100g)'],
      ['두부샐러드', '1접시'],
      ['미역국', '1그릇 (약 200ml)'],
      ['키위', '1개'],
    ],
  },
  {
    variantId: 'lunch-default',
    id: 'lunch',
    title: '점심',
    kcal: 480,
    color: '#FF7B00',
    image: lunchImage,
    foods: '현미밥, 연어구이, 두부샐러드, 미역국, 키위',
    tags: ['고단백', '건강한 지방', '영양 균형'],
    note: '한 끼에 필요한 단백질과 건강한 지방을 균형 있게 담은 구성',
    usedIngredients: ['두부', '현미밥', '토마토'],
    intake: [
      ['현미밥', '1공기 (약 150g)'],
      ['연어구이', '1토막 (약 100g)'],
      ['두부샐러드', '1접시'],
      ['미역국', '1그릇 (약 200ml)'],
      ['키위', '1개'],
    ],
  },
  {
    variantId: 'dinner-default',
    id: 'dinner',
    title: '저녁',
    kcal: 520,
    color: '#0066FF',
    image: dinnerImage,
    foods: '현미밥, 닭가슴살구이, 두부버섯볶음, 브로콜리무침',
    tags: ['근육 유지', '혈당 관리', '식이섬유'],
    note: '현미밥과 닭가슴살로 포만감과 영양 균형을 맞춘 구성',
    usedIngredients: ['현미밥', '닭가슴살', '두부', '브로콜리'],
    intake: [
      ['현미밥', '1공기 (약 150g)'],
      ['닭가슴살구이', '1조각 (약 120g)'],
      ['두부버섯볶음', '1접시'],
      ['브로콜리무침', '1접시 (약 70g)'],
    ],
  },
  {
    variantId: 'snack-default',
    id: 'snack',
    title: '간식',
    kcal: 480,
    color: '#AA2CD9',
    image: snackImage,
    foods: '그릭요거트, 블루베리, 호두',
    tags: ['고단백', '식이섬유', '건강한 지방'],
    note: '그릭요거트로 단백질을 보충하고 혈당 부담을 낮춘 구성',
    usedIngredients: ['그릭요거트', '블루베리', '호두'],
    intake: [
      ['그릭요거트', '100g'],
      ['블루베리', '10개 (약 30g)'],
      ['호두', '1개 (약 5g)'],
    ],
  },
];

const mealRecommendations: Record<MealType, Meal[]> = {
  breakfast: [
    meals[0],
    {
      ...meals[0],
      variantId: 'breakfast-oatmeal',
      image: snackImage,
      kcal: 430,
      foods: '오트밀, 그릭요거트, 블루베리, 삶은 달걀',
      tags: ['고단백', '식이섬유', '혈당 관리'],
      note: '오트밀과 그릭요거트로 포만감을 높이고 아침 혈당 부담을 낮춘 구성',
      usedIngredients: ['계란', '블루베리'],
      intake: [
        ['오트밀', '1그릇 (약 50g)'],
        ['그릭요거트', '100g'],
        ['블루베리', '한 줌 (약 40g)'],
        ['삶은 달걀', '1개'],
      ],
    },
    {
      ...meals[0],
      variantId: 'breakfast-toast',
      image: breakfastImage,
      kcal: 460,
      foods: '통밀토스트, 닭가슴살, 아보카도, 토마토',
      tags: ['근육 유지', '건강한 지방', '영양 균형'],
      note: '통밀과 닭가슴살에 건강한 지방을 더해 든든하게 시작하는 아침 식단',
      usedIngredients: ['닭가슴살', '아보카도', '토마토'],
      intake: [
        ['통밀토스트', '2장'],
        ['닭가슴살', '1조각 (약 100g)'],
        ['아보카도', '1/2개'],
        ['토마토', '1개'],
      ],
    },
    {
      ...meals[0],
      variantId: 'breakfast-sweet-potato',
      image: dinnerImage,
      kcal: 450,
      foods: '고구마, 닭가슴살 샐러드, 삶은 달걀, 사과',
      tags: ['근육 유지', '식이섬유', '체지방 관리'],
      note: '복합 탄수화물과 단백질을 균형 있게 담아 오전 에너지를 유지하는 구성',
      usedIngredients: ['닭가슴살', '계란', '시금치'],
      intake: [
        ['고구마', '1개 (약 150g)'],
        ['닭가슴살 샐러드', '1접시'],
        ['삶은 달걀', '1개'],
        ['사과', '1/2개'],
      ],
    },
  ],
  lunch: [
    meals[1],
    {
      ...meals[1],
      variantId: 'lunch-chicken-rice',
      image: breakfastImage,
      kcal: 510,
      foods: '현미밥, 닭가슴살구이, 채소볶음, 된장국',
      tags: ['고단백', '근육 유지', '영양 균형'],
      note: '현미밥과 닭가슴살을 중심으로 오후 활동에 필요한 에너지를 채운 구성',
      usedIngredients: ['현미밥', '닭가슴살', '브로콜리', '양파'],
      intake: [
        ['현미밥', '1공기 (약 150g)'],
        ['닭가슴살구이', '1조각 (약 120g)'],
        ['채소볶음', '1접시'],
        ['된장국', '1그릇'],
      ],
    },
    {
      ...meals[1],
      variantId: 'lunch-beef-bibimbap',
      image: dinnerImage,
      kcal: 540,
      foods: '소고기 채소 비빔밥, 두부구이, 방울토마토',
      tags: ['근육 유지', '식이섬유', '나트륨 조절'],
      note: '살코기와 다양한 채소를 한 그릇에 담아 단백질과 식이섬유를 보충한 식단',
      usedIngredients: ['두부', '토마토', '시금치'],
      intake: [
        ['소고기 채소 비빔밥', '1그릇'],
        ['두부구이', '4조각'],
        ['방울토마토', '5개'],
      ],
    },
    {
      ...meals[1],
      variantId: 'lunch-tofu-bowl',
      image: snackImage,
      kcal: 490,
      foods: '두부 버섯 덮밥, 브로콜리무침, 달걀국',
      tags: ['식이섬유', '혈당 관리', '영양 균형'],
      note: '두부와 버섯으로 포만감을 높이고 부담 없이 먹을 수 있게 구성한 점심 식단',
      usedIngredients: ['두부', '브로콜리', '계란'],
      intake: [
        ['두부 버섯 덮밥', '1그릇'],
        ['브로콜리무침', '1접시'],
        ['달걀국', '1그릇'],
      ],
    },
  ],
  dinner: [
    meals[2],
    {
      ...meals[2],
      variantId: 'dinner-salmon',
      image: breakfastImage,
      kcal: 500,
      foods: '연어구이, 렌틸콩 샐러드, 구운 채소',
      tags: ['고단백', '건강한 지방', '체지방 관리'],
      note: '연어의 단백질과 건강한 지방을 활용해 저녁 포만감을 높인 구성',
      usedIngredients: ['브로콜리', '토마토', '양파'],
      intake: [
        ['연어구이', '1토막 (약 120g)'],
        ['렌틸콩 샐러드', '1접시'],
        ['구운 채소', '1접시'],
      ],
    },
    {
      ...meals[2],
      variantId: 'dinner-chicken-salad',
      image: dinnerImage,
      kcal: 470,
      foods: '닭가슴살 샐러드, 단호박구이, 두부스테이크',
      tags: ['근육 유지', '식이섬유', '나트륨 조절'],
      note: '지방 부담은 낮추고 단백질과 채소 비중을 높인 가벼운 저녁 식단',
      usedIngredients: ['닭가슴살', '두부', '브로콜리'],
      intake: [
        ['닭가슴살 샐러드', '1접시'],
        ['단호박구이', '4조각'],
        ['두부스테이크', '1개'],
      ],
    },
    {
      ...meals[2],
      variantId: 'dinner-tofu-stew',
      image: snackImage,
      kcal: 490,
      foods: '잡곡밥, 두부 채소전골, 시금치무침',
      tags: ['혈당 관리', '식이섬유', '영양 균형'],
      note: '잡곡과 두부를 중심으로 늦은 시간에도 부담이 적도록 구성한 저녁 식단',
      usedIngredients: ['두부', '시금치', '양파'],
      intake: [
        ['잡곡밥', '2/3공기'],
        ['두부 채소전골', '1그릇'],
        ['시금치무침', '1접시'],
      ],
    },
  ],
  snack: [
    meals[3],
    {
      ...meals[3],
      variantId: 'snack-yogurt',
      image: snackImage,
      kcal: 210,
      foods: '그릭요거트, 딸기, 아몬드',
      tags: ['고단백', '건강한 지방', '혈당 관리'],
      note: '단백질과 건강한 지방을 소량 보충해 포만감을 유지하는 간식',
      usedIngredients: ['그릭요거트'],
      intake: [
        ['그릭요거트', '100g'],
        ['딸기', '5개'],
        ['아몬드', '8알'],
      ],
    },
    {
      ...meals[3],
      variantId: 'snack-egg-tomato',
      image: breakfastImage,
      kcal: 190,
      foods: '삶은 달걀, 방울토마토, 호두',
      tags: ['근육 유지', '나트륨 조절', '건강한 지방'],
      note: '간단한 재료로 단백질을 채우고 당 섭취를 낮춘 간식 구성',
      usedIngredients: ['계란', '토마토'],
      intake: [
        ['삶은 달걀', '1개'],
        ['방울토마토', '6개'],
        ['호두', '2알'],
      ],
    },
    {
      ...meals[3],
      variantId: 'snack-apple-cheese',
      image: dinnerImage,
      kcal: 220,
      foods: '사과, 저지방 치즈, 무가당 두유',
      tags: ['영양 균형', '식이섬유', '체지방 관리'],
      note: '과일과 단백질 식품을 함께 구성해 간식의 당 흡수를 완만하게 조절한 구성',
      usedIngredients: [],
      intake: [
        ['사과', '1/2개'],
        ['저지방 치즈', '1장'],
        ['무가당 두유', '1팩'],
      ],
    },
  ],
};

// Values remain empty until the selected date's backend summary is loaded.
const nutritionGoals: NutritionGoal[] = [
  {
    targetKey: 'calories',
    label: '열량',
    current: null,
    target: null,
    unit: 'kcal',
    Icon: Bmr,
    accentColor: '#7866F4',
    softColor: '#E8E8FF',
  },
  {
    targetKey: 'carbohydrates',
    label: '탄수화물',
    current: null,
    target: null,
    unit: 'g',
    Icon: Plant,
    accentColor: '#7866F4',
    softColor: '#E8E8FF',
  },
  {
    targetKey: 'protein',
    label: '단백질',
    current: null,
    target: null,
    unit: 'g',
    Icon: FishSimple,
    accentColor: '#7866F4',
    softColor: '#E8E8FF',
  },
  {
    targetKey: 'fat',
    label: '지방',
    current: null,
    target: null,
    unit: 'g',
    Icon: Fat,
    accentColor: '#7866F4',
    softColor: '#E8E8FF',
  },
];

const isWeb = Platform.OS === 'web';
const mealCardLayoutDuration = isWeb ? 320 : 200;
const mealCardContentDuration = isWeb ? 320 : 140;
const mealStatusFeedbackDelay = isWeb ? 100 : 60;

function addDays(source: Date, amount: number) {
  const next = new Date(source);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + amount);
  return next;
}

function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getDateCopy(date: Date, offset: number) {
  const weekday = weekdays[date.getDay()];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (offset === 0)
    return { label: `오늘 (${weekday})`, date: `${month}월 ${day}일 ${weekday}요일` };
  if (offset === -1)
    return { label: `어제 (${weekday})`, date: `${month}월 ${day}일 ${weekday}요일` };
  if (offset === 1)
    return { label: `내일 (${weekday})`, date: `${month}월 ${day}일 ${weekday}요일` };
  return { label: `${weekday}요일`, date: `${month}월 ${day}일 ${weekday}요일` };
}

type ApiRecord = Record<string, unknown>;

function isApiRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readNumber(record: ApiRecord, keys: string[]) {
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

function readMealType(value: unknown): MealType | undefined {
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

function getMealPresentation(mealId: MealType) {
  // UI-specific visual metadata only. API recommendation content is never replaced with this fixture.
  return mealRecommendations[mealId][0];
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

function mapRecommendationMeals(result: unknown): Meal[] {
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
    const presentation = getMealPresentation(mealId);
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
      ]) ?? foodCalories;

    mappedByType.set(mealId, {
      color: presentation.color,
      dietMealId,
      foods: foodNames.join(', ') || '등록된 음식이 없어요',
      id: mealId,
      image: presentation.image,
      imageUrl: readString(apiMeal, ['image_url']),
      intake: foods
        .map((food) => [foodName(food), foodAmount(food)] as [string, string])
        .filter(([name]) => Boolean(name)),
      kcal: Math.round(kcal),
      note: readString(apiMeal, ['recommendation_note', 'note', 'description', 'comment']) ?? '',
      recommendationStatus: recommendationStatusToMealStatus(readString(apiMeal, ['status'])),
      sourceType: readString(apiMeal, ['source_type']),
      tags: readArray(apiMeal.tags).filter((tag): tag is string => typeof tag === 'string'),
      title: presentation.title,
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

function mapRecommendationNutritionTargets(result: unknown): RecommendationNutritionTargets {
  if (!isApiRecord(result) || !isApiRecord(result.recommendation)) return {};

  const recommendation = result.recommendation;
  return {
    calories: readNumber(recommendation, ['target_calories']),
    carbohydrates: readNumber(recommendation, ['target_carbohydrates']),
    fat: readNumber(recommendation, ['target_fat']),
    protein: readNumber(recommendation, ['target_protein']),
  };
}

function ingredientIcon(name: string): FridgeIngredient['icon'] {
  const normalized = name.toLocaleLowerCase();
  if (/(닭|고기|연어|소고기|돼지|meat|chicken|salmon)/.test(normalized)) return 'meat';
  if (/(계란|달걀|egg)/.test(normalized)) return 'egg';
  if (/(두부|콩|bean|tofu)/.test(normalized)) return 'bean';
  if (/(사과|키위|딸기|블루베리|토마토|아보카도|fruit)/.test(normalized)) return 'fruit';
  return 'vegetable';
}

function mapInventory(value: unknown): FridgeIngredient[] {
  return readArray(value).flatMap((entry) => {
    if (!isApiRecord(entry)) return [];
    const id = readString(entry, [
      'user_food_inventory_id',
      'food_inventory_id',
      'inventory_id',
      'id',
    ]);
    const name = readString(entry, ['custom_name', 'name', 'food_name', 'ingredient_name']);
    if (!id || !name) return [];
    return [
      {
        expiresOn: readString(entry, ['expires_on']) ?? null,
        icon: ingredientIcon(name),
        id,
        name,
        purchasedOn: readString(entry, ['purchased_on']) ?? null,
        quantity: readNumber(entry, ['quantity']) ?? null,
        unit: readString(entry, ['unit']) ?? null,
      },
    ];
  });
}

function feedbackTypeToStatus(value: unknown): MealStatus | undefined {
  if (value === 'eaten') return 'eaten';
  if (value === 'different_food') return 'modified';
  if (value === 'skipped') return 'skipped';
  return undefined;
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

function mapLogDraft(log: ApiRecord, mealId: MealType): MealRecordDraft | undefined {
  const actualItems = readArray(log.actual_items ?? log.items);
  if (actualItems.length === 0) return undefined;

  const foods = actualItems.flatMap((item, index) => {
    if (!isApiRecord(item)) return [];
    const name = readString(item, ['food_name', 'name']);
    const amount = readNumber(item, ['quantity', 'amount']);
    const unit = readString(item, ['unit']);
    if (!name || amount === undefined || !unit) return [];
    return [
      {
        amount,
        carbs: readNumber(item, ['carbohydrates', 'carbs']),
        fat: readNumber(item, ['fat']),
        id: readString(item, ['meal_log_item_id', 'id']) ?? `server-food-${mealId}-${index}`,
        kcal: readNumber(item, ['calories', 'kcal']),
        name,
        protein: readNumber(item, ['protein']),
        serving: 1,
        unit,
      },
    ];
  });
  if (foods.length === 0) return undefined;

  const eatenAt = readString(log, ['eaten_at', 'created_at']);
  const kcal = foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0);
  return {
    foods,
    intake: foods.map((food) => [food.name, `${food.amount}${food.unit}`]),
    kcal,
    mealId,
    mealTime: eatenAt?.slice(11, 16) ?? '12:00',
    note: '',
    photoUri: null,
    tags: [],
    usedIngredients: [],
  };
}

const CalorieGoal = memo(function CalorieGoal({
  current,
  target,
  unit,
  accentColor,
  softColor,
}: NutritionGoal) {
  const ratio = target !== null && current !== null && target > 0 ? current / target : 0;
  const barProgress = Math.max(0, Math.min(ratio, 1));

  return (
    <View style={styles.calorieGoal}>
      <View style={styles.calorieGoalTop}>
        <View style={[styles.nutritionIcon, { backgroundColor: softColor }]}>
          <MainEnergy />
        </View>
        <Text style={styles.calorieValue}>
          {current?.toLocaleString() ?? '—'}{' '}
          <Text style={styles.calorieTarget}>
            / {target?.toLocaleString() ?? '—'} {unit}
          </Text>
        </Text>
        <Text style={main.percentage}>
          {current !== null && target !== null && target > 0 ? `${Math.round(ratio * 100)}%` : '—'}{' '}
          ⌄
        </Text>
      </View>
      <View style={styles.calorieTrack}>
        <View
          style={[
            styles.calorieFill,
            { backgroundColor: accentColor, width: `${barProgress * 100}%` },
          ]}
        />
      </View>
    </View>
  );
});

const MacroGoal = memo(function MacroGoal({
  label,
  current,
  target,
  unit,
  Icon,
  accentColor,
  softColor,
}: NutritionGoal) {
  return (
    <View style={styles.macroGoal}>
      <View style={[styles.nutritionIcon, { backgroundColor: softColor }]}>
        <Icon color={accentColor} fill={accentColor} height={20} width={20} />
      </View>
      <View style={styles.macroCopy}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {current?.toLocaleString() ?? '—'}{' '}
          <Text style={styles.macroTarget}>
            / {target?.toLocaleString() ?? '—'} {unit}
          </Text>
        </Text>
      </View>
    </View>
  );
});

function actionStyle(status: MealStatus, selectedStatus: MealStatus, pressed: boolean) {
  const selected = status === selectedStatus;
  if (status === 'eaten') {
    return [
      styles.actionButton,
      selected ? styles.actionEatenSelected : styles.actionEaten,
      pressed && styles.actionEatenPressed,
    ];
  }
  if (status === 'modified') {
    return [
      styles.actionButton,
      styles.actionWide,
      selected ? styles.actionModifiedSelected : styles.actionModified,
      pressed && styles.actionModifiedPressed,
    ];
  }
  return [
    styles.actionButton,
    selected ? styles.actionSkippedSelected : styles.actionSkipped,
    pressed && styles.actionSkippedPressed,
  ];
}

const MealCard = memo(function MealCard({
  meal,
  expanded,
  status,
  recordedMeal,
  onToggle,
  onStatusChange,
  onRecordOtherMeal,
  onRequestAlternativeMeal,
  onCollapse,
  feedbackEnabled,
  feedbackPending,
  recommendationPending,
}: {
  meal: Meal;
  expanded: boolean;
  status: MealStatus;
  recordedMeal?: MealRecordDraft;
  onToggle: (mealId: MealType) => void;
  onStatusChange: (
    mealId: MealType,
    status: Extract<MealStatus, 'eaten' | 'skipped'>,
  ) => Promise<boolean>;
  onRecordOtherMeal: (mealId: MealType) => void;
  onRequestAlternativeMeal: (mealId: MealType) => void;
  onCollapse: (mealId: MealType) => void;
  feedbackEnabled: boolean;
  feedbackPending: boolean;
  recommendationPending: boolean;
}) {
  const [detailHeight, setDetailHeight] = useState(0);
  const [detailProgress] = useState(() => new Animated.Value(expanded ? 1 : 0));
  const [detailOpacity] = useState(() => new Animated.Value(expanded ? 1 : 0));
  const [failedRemoteImageUrl, setFailedRemoteImageUrl] = useState<string | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousExpanded = useRef(expanded);
  const displayedStatus = status;
  const dimmed = displayedStatus === 'skipped';
  const showsRecordedMeal = displayedStatus === 'modified' && recordedMeal !== undefined;
  const displayedFoods = showsRecordedMeal
    ? recordedMeal.foods.map((food) => food.name).join(', ')
    : meal.foods;
  const displayedKcal = showsRecordedMeal ? recordedMeal.kcal : meal.kcal;
  const usesRemoteRecommendationImage =
    !showsRecordedMeal && Boolean(meal.imageUrl) && meal.imageUrl !== failedRemoteImageUrl;
  const displayedImage = showsRecordedMeal
    ? recordedMeal.photoUri
      ? { uri: recordedMeal.photoUri }
      : emptyFoodImage
    : usesRemoteRecommendationImage
      ? { uri: meal.imageUrl }
      : meal.image;
  const displayedUsedIngredients = showsRecordedMeal
    ? recordedMeal.usedIngredients
    : meal.usedIngredients;
  const displayedIntake = showsRecordedMeal ? recordedMeal.intake : meal.intake;

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  // 접힘 상태에서는 detailHeight가 다시 측정돼도 진행 중인 collapse를 재시작하지 않는다.
  // 펼침 시작에만 실제 측정 높이가 필요하다.
  const canAnimateDetail = !expanded || detailHeight > 0;

  useEffect(() => {
    if (previousExpanded.current === expanded) return;

    // 상세 영역의 실제 높이가 측정되기 전에는
    // expand animation을 시작하지 않는다.
    if (!canAnimateDetail) return;

    previousExpanded.current = expanded;

    let transitionEnded = false;

    const endTransition = () => {
      if (transitionEnded) return;
      transitionEnded = true;
    };

    const heightAnimation = Animated.timing(detailProgress, {
      duration: mealCardLayoutDuration,
      easing: Easing.inOut(Easing.ease),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
    });

    const opacityAnimation = Animated.timing(detailOpacity, {
      duration: mealCardContentDuration,
      easing: Easing.inOut(Easing.ease),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
    });

    const animation = Animated.parallel([heightAnimation, opacityAnimation]);

    animation.start(({ finished }) => {
      if (finished) {
        endTransition();
      }
    });

    return () => {
      animation.stop();
      endTransition();
    };
  }, [canAnimateDetail, detailOpacity, detailProgress, expanded]);

  const chooseStatus = async (nextStatus: Extract<MealStatus, 'eaten' | 'skipped'>) => {
    if (!feedbackEnabled || feedbackPending) return;
    if (statusTimer.current) clearTimeout(statusTimer.current);
    const didSave = await onStatusChange(meal.id, nextStatus);
    if (!didSave) return;
    statusTimer.current = setTimeout(() => {
      onCollapse(meal.id);
      statusTimer.current = null;
    }, mealStatusFeedbackDelay);
  };

  const renderDetailContent = () => (
    <>
      {expanded && (usesRemoteRecommendationImage || recordedMeal?.photoUri) && (
        <Image
          source={displayedImage}
          onError={() => setFailedRemoteImageUrl(meal.imageUrl ?? null)}
          style={{ width: '100%', height: 160, borderRadius: 10 }}
          resizeMode="cover"
        />
      )}
      <View style={styles.mealDivider} />
      <View style={styles.fridgeDetailCard}>
        <View style={styles.fridgeDetailHeader}>
          <View style={styles.detailTitleRow}>
            <LeafFill color="#7866F4" fill="#7866F4" height={25} width={25} />
            <Text style={[styles.detailTitle, styles.fridgeDetailTitle]}>냉장고 재료 활용</Text>
          </View>

          <View style={styles.detailBadge}>
            <Text style={styles.detailBadgeText}>{displayedUsedIngredients.length}개 활용</Text>
          </View>
        </View>

        <View style={styles.fridgeIngredientRow}>
          <Text style={styles.fridgeIngredient}>
            {displayedUsedIngredients.length > 0
              ? displayedUsedIngredients.join(' · ')
              : '분석된 재료가 없어요'}
          </Text>
        </View>
      </View>

      <View style={styles.intakeCard}>
        <View style={styles.intakeTitleRow}>
          <View style={styles.detailTitleRow}>
            <ForkKnife color="#5C4D3C" height={25} width={25} />
            <Text style={[styles.detailTitle, styles.intakeTitle]}>권장 섭취량</Text>
          </View>

          <View style={styles.intakeBadge}>
            <Text style={styles.intakeBadgeText}>1인 기준</Text>
          </View>
        </View>

        <View style={styles.intakeItems}>
          {displayedIntake.map(([name, amount], index) => (
            <View key={`${name}-${index}`} style={styles.intakeItem}>
              <Text style={styles.intakeName}>{name}</Text>
              <Text numberOfLines={1} style={styles.intakeAmount}>
                {amount}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {displayedStatus === 'recommended' && (
        <Pressable
          accessibilityRole="button"
          disabled={recommendationPending}
          onPress={(event) => {
            event.stopPropagation();
            onRequestAlternativeMeal(meal.id);
          }}
          style={main.record}
        >
          <Text style={main.recordText}>
            {recommendationPending ? '다른 식단 추천 중…' : '다른 식단 추천받기'}
          </Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            void chooseStatus('eaten');
          }}
          disabled={!feedbackEnabled || feedbackPending}
          style={({ pressed }) => [
            actionStyle('eaten', displayedStatus, pressed),
            !feedbackEnabled && styles.actionDisabled,
          ]}
        >
          <Check color="#7866F4" height={15} width={15} />
          <Text style={[styles.actionText, styles.actionEatenText]}>먹었어요</Text>
        </Pressable>

        <Pressable
          disabled={!feedbackEnabled || feedbackPending || displayedStatus === 'modified'}
          onPress={(event) => {
            event.stopPropagation();
            if (displayedStatus === 'modified') return;
            onRecordOtherMeal(meal.id);
          }}
          style={({ pressed }) => [
            actionStyle('modified', displayedStatus, pressed),
            !feedbackEnabled && styles.actionDisabled,
          ]}
        >
          <Pencil color="#0066FF" height={15} width={15} />
          <Text style={[styles.actionText, styles.actionModifiedText]}>다른 음식 먹었어요</Text>
        </Pressable>

        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            void chooseStatus('skipped');
          }}
          disabled={!feedbackEnabled || feedbackPending}
          style={({ pressed }) => [
            actionStyle('skipped', displayedStatus, pressed),
            !feedbackEnabled && styles.actionDisabled,
          ]}
        >
          <Prohibit color="#727272" height={15} width={15} />
          <Text style={[styles.actionText, styles.actionSkippedText]}>건너뛰었어요</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <Pressable
      accessibilityState={{ expanded }}
      onPress={() => onToggle(meal.id)}
      style={[styles.mealCard, Platform.OS === 'web' && styles.mealCardWeb]}
    >
      {displayedStatus === 'eaten' ? (
        <View pointerEvents="none" style={[styles.selectedCardBorder, styles.eatenCardBorder]} />
      ) : null}

      {displayedStatus === 'modified' ? (
        <View pointerEvents="none" style={[styles.selectedCardBorder, styles.modifiedCardBorder]} />
      ) : null}

      <View
        style={[
          main.mealAccent,
          { backgroundColor: displayedStatus === 'recommended' ? colors.primary : '#B5B5B5' },
        ]}
      />
      <View style={main.mealTop}>
        <View style={main.mealBadge}>
          {meal.id === 'dinner' ? <MainMoon /> : <MainSun />}
          <Text style={[styles.mealTitle, { color: colors.primary }]}>{meal.title}</Text>
        </View>
        <Text style={main.mealKcal}>{displayedKcal} kcal</Text>
      </View>
      <View style={main.mealBottom}>
        <Text numberOfLines={2} style={[main.foods, dimmed && styles.skippedContent]}>
          {displayedFoods}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={feedbackPending}
          onPress={(event) => {
            event.stopPropagation();
            if (displayedStatus === 'recommended' && feedbackEnabled) void chooseStatus('eaten');
            else onToggle(meal.id);
          }}
          style={main.record}
        >
          <Text style={main.recordText}>
            {displayedStatus === 'recommended' && feedbackEnabled ? '✓ 섭취' : '기록 ⌄'}
          </Text>
        </Pressable>
      </View>

      <View
        accessibilityElementsHidden
        collapsable={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (nextHeight <= 0) return;

          setDetailHeight((currentHeight) =>
            Math.abs(currentHeight - nextHeight) < 0.5 ? currentHeight : nextHeight,
          );
        }}
        style={styles.expandedMeasure}
      >
        <View style={styles.expandedContent}>{renderDetailContent()}</View>
      </View>

      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[
          styles.expandedClip,
          {
            height:
              detailHeight > 0
                ? detailProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, detailHeight],
                  })
                : 0,
            opacity: detailOpacity,
          },
        ]}
      >
        <View style={styles.expandedContent}>{renderDetailContent()}</View>
      </Animated.View>
    </Pressable>
  );
});

export default function DietScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [today] = useState(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return date;
  });
  const [selectedDateOffset, setSelectedDateOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(today));
  const [expandedMeals, setExpandedMeals] = useState<Set<MealType>>(() => new Set());
  const [statusesByDate, setStatusesByDate] = useState<Record<string, Partial<MealStatuses>>>({});
  const [showNutrition, setShowNutrition] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const [activeSheet, setActiveSheet] = useState<DietSheet>(null);
  const [recordingMealId, setRecordingMealId] = useState<MealType | null>(null);
  const [recommendedMeals, setRecommendedMeals] = useState<Meal[]>([]);
  const [recommendationNutritionTargets, setRecommendationNutritionTargets] =
    useState<RecommendationNutritionTargets>({});
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [nutritionSummary, setNutritionSummary] = useState<NutritionSummary | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [feedbackMealIds, setFeedbackMealIds] = useState<Set<MealType>>(() => new Set());
  const [regeneratingMealIds, setRegeneratingMealIds] = useState<Set<MealType>>(() => new Set());
  const [mealRecordsByDate, setMealRecordsByDate] = useState<
    Record<string, Partial<Record<MealType, MealRecordDraft>>>
  >({});
  const [fridgeIngredients, setFridgeIngredients] = useState<FridgeIngredient[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const feedbackRequestMealIdsRef = useRef(new Set<MealType>());
  const isMountedRef = useRef(true);
  const mealLogsRequestRef = useRef(0);
  const mealLogEntriesByDateRef = useRef(new Map<string, unknown[]>());
  const recommendationRequestRef = useRef(0);
  const recommendationMealsByDateRef = useRef<{ dateKey: string | null; meals: Meal[] }>({
    dateKey: null,
    meals: [],
  });
  const nutritionSummaryRequestRef = useRef(0);
  const regenerateRequestMealIdsRef = useRef(new Set<MealType>());

  const bottomPadding =
    getBottomNavigationVisualHeight(windowHeight) +
    Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP) +
    16;

  const indicator = useCustomScrollIndicator({ showInitially: true });
  const visibleMeals = recommendedMeals;

  const displayedNutritionGoals = useMemo(
    () =>
      nutritionGoals.map((goal) => ({
        ...goal,
        current:
          nutritionSummary?.date === selectedDateKey
            ? nutritionNumber(nutritionSummary[goal.targetKey]?.consumed)
            : null,
        target:
          nutritionSummary?.date === selectedDateKey
            ? nutritionNumber(nutritionSummary[goal.targetKey]?.target)
            : (recommendationNutritionTargets[goal.targetKey] ?? null),
      })),
    [recommendationNutritionTargets, nutritionSummary, selectedDateKey],
  );
  const recommendationStatuses = useMemo(
    () =>
      visibleMeals.reduce<MealStatuses>(
        (currentStatuses, meal) => ({
          ...currentStatuses,
          [meal.id]: meal.recommendationStatus ?? currentStatuses[meal.id],
        }),
        { ...defaultMealStatuses },
      ),
    [visibleMeals],
  );
  const selectedStatuses = useMemo<MealStatuses>(
    () => ({
      ...recommendationStatuses,
      ...(statusesByDate[selectedDateKey] ?? {}),
    }),
    [recommendationStatuses, selectedDateKey, statusesByDate],
  );
  const selectedDate = addDays(today, selectedDateOffset);
  const selectedDateCopy = getDateCopy(selectedDate, selectedDateOffset);
  const feedbackEnabled = selectedDateKey === toDateKey(new Date());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    void getProfile()
      .then((response) => {
        if (isActive) setUserName(getProfileName(response) ?? null);
      })
      .catch(() => {
        if (isActive) setUserName(null);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const toggleMeal = useCallback((mealId: MealType) => {
    setExpandedMeals((current) => {
      const next = new Set(current);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
  }, []);

  const applyMealLogs = useCallback((dateKey: string, sourceMeals: Meal[], entries: unknown[]) => {
    const mealsByDietId = new Map(
      sourceMeals
        .filter((meal): meal is Meal & { dietMealId: string } => Boolean(meal.dietMealId))
        .map((meal) => [meal.dietMealId, meal]),
    );
    const nextStatuses: Partial<MealStatuses> = {};
    const nextRecords: Partial<Record<MealType, MealRecordDraft>> = {};

    entries.forEach((entry) => {
      if (!isApiRecord(entry)) return;
      const dietMealId = readString(entry, ['diet_meal_id', 'meal_id']);
      const targetMeal =
        (dietMealId ? mealsByDietId.get(dietMealId) : undefined) ??
        sourceMeals.find(
          (meal) =>
            meal.id ===
            readMealType(readString(entry, ['meal_type', 'meal_category', 'type', 'time_of_day'])),
        );
      const nextStatus = feedbackTypeToStatus(readString(entry, ['feedback_type', 'type']));
      if (!targetMeal || !nextStatus) return;

      nextStatuses[targetMeal.id] = nextStatus;
      if (nextStatus === 'modified') {
        const draft = mapLogDraft(entry, targetMeal.id);
        if (draft) nextRecords[targetMeal.id] = draft;
      }
    });

    setStatusesByDate((current) => ({ ...current, [dateKey]: nextStatuses }));
    setMealRecordsByDate((current) => ({ ...current, [dateKey]: nextRecords }));
  }, []);

  const loadMealLogs = useCallback(
    async (dateKey: string) => {
      const requestId = ++mealLogsRequestRef.current;
      try {
        const response = await getDietMealLogs(dateKey, dateKey);
        if (!isMountedRef.current || requestId !== mealLogsRequestRef.current) return;

        const entries = readArray(response.logs);
        mealLogEntriesByDateRef.current.set(dateKey, entries);

        const recommendationSnapshot = recommendationMealsByDateRef.current;
        if (recommendationSnapshot.dateKey === dateKey && recommendationSnapshot.meals.length > 0) {
          applyMealLogs(dateKey, recommendationSnapshot.meals, entries);
        }
      } catch (error) {
        if (!isMountedRef.current || requestId !== mealLogsRequestRef.current) return;
        Alert.alert('식사 기록을 불러오지 못했어요', getDietApiErrorMessage(error));
      }
    },
    [applyMealLogs],
  );

  const loadRecommendations = useCallback(
    async (dateKey: string) => {
      const requestId = ++recommendationRequestRef.current;
      recommendationMealsByDateRef.current = { dateKey, meals: [] };
      mealLogEntriesByDateRef.current.delete(dateKey);
      if (isMountedRef.current) {
        setRecommendationError(null);
        setRecommendationLoading(true);
        setRecommendedMeals([]);
        setRecommendationNutritionTargets({});
      }

      try {
        const response = await getDietRecommendationsByDate(dateKey);
        if (__DEV__) {
          const result = isApiRecord(response.result) ? response.result : undefined;
          const recommendation = isApiRecord(result?.recommendation)
            ? result.recommendation
            : undefined;
          const apiMeals = readArray(result?.meals ?? recommendation?.meals);
          console.log(
            '[Diet Recommendations GET] response',
            apiMeals.map((meal) => {
              const record = isApiRecord(meal) ? meal : undefined;
              return {
                diet_meal_id: record?.diet_meal_id,
                foods: record?.foods,
                meal_type: record?.meal_type,
                recommendation_note: record?.recommendation_note,
                source_type: record?.source_type,
              };
            }),
            { dateKey },
          );
        }
        const mappedMeals = mapRecommendationMeals(response.result);
        const mappedNutritionTargets = mapRecommendationNutritionTargets(response.result);

        if (__DEV__) {
          console.log(
            '[Diet Recommendations GET] mapped meals',
            mappedMeals.map((meal) => ({
              dietMealId: meal.dietMealId,
              foods: meal.foods,
              id: meal.id,
              note: meal.note,
              sourceType: meal.sourceType,
            })),
            { dateKey },
          );
        }

        if (!isMountedRef.current || requestId !== recommendationRequestRef.current) return false;

        setRecommendedMeals(mappedMeals);
        setRecommendationNutritionTargets(mappedNutritionTargets);
        recommendationMealsByDateRef.current = { dateKey, meals: mappedMeals };
        const mealLogEntries = mealLogEntriesByDateRef.current.get(dateKey);
        if (mealLogEntries) applyMealLogs(dateKey, mappedMeals, mealLogEntries);
        return true;
      } catch (error) {
        if (!isMountedRef.current || requestId !== recommendationRequestRef.current) return false;
        const message = getDietApiErrorMessage(error);
        setRecommendationError(message);
        Alert.alert('식단 추천을 불러오지 못했어요', message);
        return false;
      } finally {
        if (isMountedRef.current && requestId === recommendationRequestRef.current) {
          setRecommendationLoading(false);
        }
      }
    },
    [applyMealLogs],
  );

  const loadNutritionSummary = useCallback(async (dateKey: string) => {
    const requestId = ++nutritionSummaryRequestRef.current;
    setNutritionError(null);
    try {
      const response = await getDietNutritionSummary(dateKey);
      if (!isMountedRef.current || requestId !== nutritionSummaryRequestRef.current) return;
      setNutritionSummary(response.summary);
    } catch (error) {
      if (!isMountedRef.current || requestId !== nutritionSummaryRequestRef.current) return;
      setNutritionSummary(null);
      setNutritionError(getDietApiErrorMessage(error));
    }
  }, []);

  const loadInventory = useCallback(async () => {
    if (isMountedRef.current) setInventoryLoading(true);
    try {
      const response = await getDietInventory();
      if (!isMountedRef.current) return;
      setFridgeIngredients(mapInventory(response.inventory));
    } catch (error) {
      if (!isMountedRef.current) return;
      setFridgeIngredients([]);
      Alert.alert('냉장고 재료를 불러오지 못했어요', getDietApiErrorMessage(error));
    } finally {
      if (isMountedRef.current) setInventoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadInventory();
    });
    return () => cancelAnimationFrame(frame);
  }, [loadInventory]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadRecommendations(selectedDateKey);
      void loadNutritionSummary(selectedDateKey);
      void loadMealLogs(selectedDateKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadMealLogs, loadNutritionSummary, loadRecommendations, selectedDateKey]);

  const collapseMeal = useCallback((mealId: MealType) => {
    setExpandedMeals((current) => {
      if (!current.has(mealId)) return current;
      const next = new Set(current);
      next.delete(mealId);
      return next;
    });
  }, []);

  const openMealRecord = useCallback((_mealId: MealType) => {
    Alert.alert(
      '사진 분석 준비 중',
      '이 테스트 버전에서는 추천 식사의 먹음·건너뜀 기록을 이용해 주세요. 다른 식사의 사진 분석은 아직 연결되지 않았어요.',
    );
  }, []);

  const saveDietMealFeedback = useCallback(
    (dietMealId: string, input: DietFeedbackInput, hasExistingFeedback: boolean) =>
      hasExistingFeedback
        ? updateDietMealFeedback(dietMealId, input)
        : submitDietMealFeedback(dietMealId, input),
    [],
  );

  const submitFeedback = useCallback(
    async (mealId: MealType, status: Extract<MealStatus, 'eaten' | 'skipped'>) => {
      const meal = recommendedMeals.find((candidate) => candidate.id === mealId);
      const dietMealId = meal?.dietMealId;
      if (!dietMealId || feedbackRequestMealIdsRef.current.has(mealId)) {
        Alert.alert(
          '식사 상태를 저장할 수 없어요',
          '추천 식단 정보를 다시 불러온 뒤 시도해 주세요.',
        );
        return false;
      }

      const dateKey = selectedDateKey;
      const hasExistingFeedback = selectedStatuses[mealId] !== 'recommended';
      feedbackRequestMealIdsRef.current.add(mealId);
      setFeedbackMealIds((current) => new Set(current).add(mealId));
      try {
        if (__DEV__) {
          console.log('[Diet feedback] routing:', {
            current_status: selectedStatuses[mealId],
            diet_meal_id: dietMealId,
            feedback_type: status,
            has_existing_feedback: hasExistingFeedback,
            reason: hasExistingFeedback
              ? 'current_status_is_not_recommended'
              : 'current_status_is_recommended',
          });
        }
        await saveDietMealFeedback(
          dietMealId,
          {
            ...(status === 'eaten'
              ? {
                  ...(hasExistingFeedback ? { actualItems: [] } : {}),
                  eatenAt: new Date().toISOString(),
                }
              : hasExistingFeedback
                ? { actualItems: [], eatenAt: null }
                : {}),
            feedbackType: status,
          },
          hasExistingFeedback,
        );
        if (!isMountedRef.current) return false;

        setStatusesByDate((current) => ({
          ...current,
          [dateKey]: { ...(current[dateKey] ?? {}), [mealId]: status },
        }));
        setMealRecordsByDate((current) => {
          const dateRecords = current[dateKey];
          if (!dateRecords?.[mealId]) return current;

          const nextDateRecords = { ...dateRecords };
          delete nextDateRecords[mealId];
          return { ...current, [dateKey]: nextDateRecords };
        });
        void loadNutritionSummary(dateKey);
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert('식사 상태를 저장하지 못했어요', getDietApiErrorMessage(error));
        }
        return false;
      } finally {
        feedbackRequestMealIdsRef.current.delete(mealId);
        if (isMountedRef.current) {
          setFeedbackMealIds((current) => {
            const next = new Set(current);
            next.delete(mealId);
            return next;
          });
        }
      }
    },
    [
      loadNutritionSummary,
      recommendedMeals,
      saveDietMealFeedback,
      selectedDateKey,
      selectedStatuses,
    ],
  );

  const regenerateMeal = useCallback(
    async (mealId: MealType) => {
      const currentMeal = recommendedMeals.find((meal) => meal.id === mealId);
      const dietMealId = currentMeal?.dietMealId;
      if (!dietMealId || regenerateRequestMealIdsRef.current.has(mealId)) return;
      const requestStartedAtDate = new Date();
      const requestId = `diet-regenerate-${mealId}-${requestStartedAtDate.getTime()}`;
      const finalRequestUrl = `${API_BASE_URL}/api/diet/meals/${encodeURIComponent(dietMealId)}/regenerate`;

      if (__DEV__) {
        console.log('[Diet Regenerate] START', {
          dateKey: selectedDateKey,
          dietMealId,
          foods: currentMeal.foods,
          mealId,
          requestId,
          sourceType: currentMeal.sourceType,
        });
      }

      regenerateRequestMealIdsRef.current.add(mealId);
      setRegeneratingMealIds((current) => new Set(current).add(mealId));
      try {
        const response = await regenerateDietMeal(dietMealId);

        const rawRegeneratedMeal = response.meal;

        if (__DEV__) {
          const rawMeal = isApiRecord(rawRegeneratedMeal) ? rawRegeneratedMeal : undefined;
          console.log('[Diet Regenerate] response', {
            diet_meal_id: rawMeal?.diet_meal_id,
            foods: rawMeal?.foods,
            meal_type: rawMeal?.meal_type,
            recommended_calories: rawMeal?.recommended_calories,
            recommendation_note: rawMeal?.recommendation_note,
            requestId,
            source_type: rawMeal?.source_type,
          });
        }

        if (!isMountedRef.current) return;

        const mealForMapping =
          isApiRecord(rawRegeneratedMeal) && response.used_ingredients !== undefined
            ? { ...rawRegeneratedMeal, used_ingredients: response.used_ingredients }
            : rawRegeneratedMeal;
        const regeneratedMeal = mapRecommendationMeals({ meals: [mealForMapping] }).find(
          (meal) => meal.id === mealId,
        );
        if (regeneratedMeal) {
          setRecommendedMeals((current) => {
            const previousMeal = current.find((meal) => meal.id === mealId);
            const next = current.map((meal) => (meal.id === mealId ? regeneratedMeal : meal));
            if (__DEV__) {
              console.log('[Diet Regenerate] state update', {
                after: {
                  dietMealId: regeneratedMeal.dietMealId,
                  foods: regeneratedMeal.foods,
                  sourceType: regeneratedMeal.sourceType,
                },
                before: previousMeal
                  ? {
                      dietMealId: previousMeal.dietMealId,
                      foods: previousMeal.foods,
                      sourceType: previousMeal.sourceType,
                    }
                  : null,
                mealId,
                requestId,
              });
            }
            return next;
          });
          return;
        }

        // The regenerate response schema is free-form. Re-read the selected date using the
        // established recommendation mapper rather than constructing a meal client-side.
        await loadRecommendations(selectedDateKey);
      } catch (error) {
        if (__DEV__) {
          const apiError = error instanceof ApiError ? error : undefined;
          console.error('[Diet Regenerate] FAILED', {
            detail: apiError?.detail ?? null,
            finalRequestUrl,
            httpStatus: apiError?.status ?? null,
            message: apiError?.message ?? (error instanceof Error ? error.message : String(error)),
            requestedAtIso: requestStartedAtDate.toISOString(),
          });
        }
        if (isMountedRef.current) {
          Alert.alert('식단을 다시 추천하지 못했어요', getDietApiErrorMessage(error));
        }
      } finally {
        regenerateRequestMealIdsRef.current.delete(mealId);
        if (isMountedRef.current) {
          setRegeneratingMealIds((current) => {
            const next = new Set(current);
            next.delete(mealId);
            return next;
          });
        }
      }
    },
    [loadRecommendations, recommendedMeals, selectedDateKey],
  );

  const requestAlternativeMeal = useCallback(
    (mealId: MealType) => {
      if (recommendationLoading) return;
      Alert.alert('다른 식단을 추천받을까요?', '선택한 끼니만 새로운 식단으로 바꿔드려요.', [
        { style: 'cancel', text: '취소' },
        { onPress: () => void regenerateMeal(mealId), text: '새로 추천받기' },
      ]);
    },
    [regenerateMeal, recommendationLoading],
  );

  const completeMealRecord = useCallback(
    async (draft: MealRecordDraft) => {
      const mealId = draft.mealId as MealType;
      const meal = recommendedMeals.find((candidate) => candidate.id === mealId);
      const dietMealId = meal?.dietMealId;
      const actualItems: DietActualItem[] = draft.foods.map((food) => ({
        calories: food.kcal ?? null,
        carbohydrates: food.carbs ?? null,
        fat: food.fat ?? null,
        food_name: food.name.trim(),
        protein: food.protein ?? null,
        quantity: food.amount,
        unit: food.unit.trim(),
      }));

      if (
        !dietMealId ||
        feedbackRequestMealIdsRef.current.has(mealId) ||
        actualItems.length < 1 ||
        actualItems.length > 20 ||
        actualItems.some(
          (item) =>
            !item.food_name ||
            !item.unit ||
            (typeof item.quantity === 'number' && item.quantity <= 0),
        )
      ) {
        Alert.alert('식사 기록을 저장할 수 없어요', '음식명, 수량, 단위를 확인해 주세요.');
        return false;
      }

      const dateKey = selectedDateKey;
      const hasExistingFeedback = selectedStatuses[mealId] !== 'recommended';
      feedbackRequestMealIdsRef.current.add(mealId);
      setFeedbackMealIds((current) => new Set(current).add(mealId));
      try {
        if (__DEV__) {
          console.log('[Diet feedback] routing:', {
            current_status: selectedStatuses[mealId],
            diet_meal_id: dietMealId,
            feedback_type: 'different_food',
            has_existing_feedback: hasExistingFeedback,
            reason: hasExistingFeedback
              ? 'current_status_is_not_recommended'
              : 'current_status_is_recommended',
          });
        }
        await saveDietMealFeedback(
          dietMealId,
          {
            actualItems,
            eatenAt: new Date().toISOString(),
            feedbackType: 'different_food',
          },
          hasExistingFeedback,
        );
        if (!isMountedRef.current) return false;

        setMealRecordsByDate((current) => ({
          ...current,
          [dateKey]: {
            ...(current[dateKey] ?? {}),
            [mealId]: draft,
          },
        }));
        setStatusesByDate((current) => ({
          ...current,
          [dateKey]: { ...(current[dateKey] ?? {}), [mealId]: 'modified' },
        }));
        setRecordingMealId(null);
        collapseMeal(mealId);
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert('식사 기록을 저장하지 못했어요', getDietApiErrorMessage(error));
        }
        return false;
      } finally {
        feedbackRequestMealIdsRef.current.delete(mealId);
        if (isMountedRef.current) {
          setFeedbackMealIds((current) => {
            const next = new Set(current);
            next.delete(mealId);
            return next;
          });
        }
      }
    },
    [collapseMeal, recommendedMeals, saveDietMealFeedback, selectedDateKey, selectedStatuses],
  );

  const addInventoryIngredient = useCallback(
    async (name: string) => {
      try {
        const response = await createDietInventoryItem({
          expiresOn: null,
          name,
          purchasedOn: null,
          quantity: null,
          unit: null,
        });
        const addedItem = mapInventory([response.item])[0];
        if (!isMountedRef.current) return false;

        if (addedItem) {
          setFridgeIngredients((current) => [...current, addedItem]);
        } else {
          await loadInventory();
        }
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert('재료를 추가하지 못했어요', getDietApiErrorMessage(error));
        }
        return false;
      }
    },
    [loadInventory],
  );

  const deleteInventoryIngredients = useCallback(
    async (inventoryIds: string[]) => {
      try {
        for (const inventoryId of inventoryIds) {
          await deleteDietInventoryItem(inventoryId);
        }
        if (!isMountedRef.current) return false;

        const deletedIds = new Set(inventoryIds);
        setFridgeIngredients((current) => current.filter((item) => !deletedIds.has(item.id)));
        return true;
      } catch (error) {
        if (isMountedRef.current) {
          Alert.alert('재료를 삭제하지 못했어요', getDietApiErrorMessage(error));
          await loadInventory();
        }
        return false;
      }
    },
    [loadInventory],
  );

  const moveSelectedDate = (amount: number) => {
    const nextOffset = Math.max(
      dateWindowMin,
      Math.min(dateWindowMax, selectedDateOffset + amount),
    );
    if (nextOffset === selectedDateOffset) return;

    const nextDateKey = toDateKey(addDays(today, nextOffset));
    recommendationMealsByDateRef.current = { dateKey: nextDateKey, meals: [] };
    setRecommendedMeals([]);
    setRecommendationError(null);
    setRecommendationLoading(true);
    setSelectedDateOffset(nextOffset);
    setSelectedDateKey(nextDateKey);
    setExpandedMeals(new Set());
  };

  return (
    <View style={[styles.root, Platform.OS === 'web' && styles.webViewport]}>
      <ScrollView
        bounces={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={indicator.onContentSizeChange}
        onLayout={indicator.onLayout}
        onMomentumScrollBegin={indicator.onMomentumScrollBegin}
        onMomentumScrollEnd={indicator.onMomentumScrollEnd}
        onScroll={indicator.onScroll}
        onScrollBeginDrag={indicator.onScrollBeginDrag}
        onScrollEndDrag={indicator.onScrollEndDrag}
        overScrollMode="never"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={Platform.OS === 'web' ? styles.webScrollViewport : undefined}
      >
        <MainHeader title="식단 추천">
          <Image source={hero} resizeMode="contain" style={main.heroImage} />
          <Text style={main.heroTitle}>
            {userName ? `${userName}님을 위한` : '나를 위한'}
            {'\n'}
            <Text style={main.accent}>맞춤 식단</Text>
          </Text>
          <Text style={main.heroDescription}>근육은 지키고, 체지방은 천천히</Text>
          <View style={main.dateControls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => moveSelectedDate(-selectedDateOffset)}
              style={main.today}
            >
              <MainRefresh />
              <Text style={main.todayText}>오늘</Text>
            </Pressable>
            <View style={main.dateRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이전 날짜"
                disabled={selectedDateOffset <= dateWindowMin}
                onPress={() => moveSelectedDate(-1)}
                style={[
                  main.dateArrow,
                  selectedDateOffset <= dateWindowMin && styles.arrowDisabled,
                ]}
              >
                <MainLeft />
              </Pressable>
              <Text style={main.dateText}>{selectedDateCopy.date}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음 날짜"
                disabled={selectedDateOffset >= dateWindowMax}
                onPress={() => moveSelectedDate(1)}
                style={[
                  main.dateArrow,
                  selectedDateOffset >= dateWindowMax && styles.arrowDisabled,
                ]}
              >
                <MainRight />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowDates(true)}
                style={main.dateSelect}
              >
                <MainCalendar />
                <Text style={main.dateSelectText}>날짜 선택</Text>
              </Pressable>
            </View>
          </View>
        </MainHeader>
        <View style={main.content}>
          <View style={styles.nutritionCard}>
            <Text style={styles.nutritionTitle}>오늘의 영양 목표</Text>
            {nutritionError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadNutritionSummary(selectedDateKey)}
              >
                <Text style={styles.mealErrorText}>{nutritionError} · 다시 시도</Text>
              </Pressable>
            ) : null}
            {nutritionSummary?.date === selectedDateKey && nutritionSummary.has_unknown_items ? (
              <Text style={styles.mealLoadMessage}>
                영양 정보가 없는 음식은 합계에서 제외되어 있어요.
              </Text>
            ) : null}
            <View style={styles.nutritionInner}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="영양소 상세"
                accessibilityState={{ expanded: showNutrition }}
                onPress={() => setShowNutrition((v) => !v)}
              >
                <CalorieGoal {...displayedNutritionGoals[0]} />
              </Pressable>
              {showNutrition && (
                <View style={styles.macroGoals}>
                  {displayedNutritionGoals.slice(1).map((goal) => (
                    <MacroGoal key={goal.label} {...goal} />
                  ))}
                </View>
              )}
            </View>
          </View>
          <View style={main.mealChips}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((id, index) => (
              <View
                key={id}
                style={[
                  main.mealChip,
                  ['eaten', 'modified'].includes(selectedStatuses[id]) && main.recordedChip,
                ]}
              >
                <Text
                  style={[
                    main.mealChipText,
                    ['eaten', 'modified'].includes(selectedStatuses[id]) && main.recordedChipText,
                  ]}
                >
                  {['eaten', 'modified'].includes(selectedStatuses[id]) ? '✓ ' : ''}
                  {['아침', '점심', '저녁', '간식'][index]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.mealSectionTitle}>오늘의 추천 식단</Text>
          <View style={styles.mealList}>
            {recommendationLoading ? (
              <Text style={styles.mealLoadMessage}>식단 추천을 불러오는 중이에요.</Text>
            ) : null}
            {recommendationError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadRecommendations(selectedDateKey)}
                style={({ pressed }) => [styles.mealErrorCard, pressed && styles.pressed]}
              >
                <Text style={styles.mealErrorText}>{recommendationError}</Text>
                <Text style={styles.mealRetryText}>다시 시도</Text>
              </Pressable>
            ) : null}
            {!recommendationLoading && !recommendationError && visibleMeals.length === 0 ? (
              <Text style={styles.mealLoadMessage}>표시할 추천 식단이 없어요.</Text>
            ) : null}
            {visibleMeals.map((meal) => (
              <MealCard
                expanded={expandedMeals.has(meal.id)}
                feedbackEnabled={feedbackEnabled}
                feedbackPending={feedbackMealIds.has(meal.id)}
                key={meal.id}
                meal={meal}
                recordedMeal={mealRecordsByDate[selectedDateKey]?.[meal.id]}
                onCollapse={collapseMeal}
                onRecordOtherMeal={openMealRecord}
                onRequestAlternativeMeal={requestAlternativeMeal}
                onStatusChange={submitFeedback}
                onToggle={toggleMeal}
                recommendationPending={regeneratingMealIds.has(meal.id)}
                status={selectedStatuses[meal.id]}
              />
            ))}
          </View>
          <Pressable
            accessibilityLabel="냉장고 재료 관리 열기"
            accessibilityRole="button"
            disabled={inventoryLoading}
            onPress={() => setActiveSheet('fridge')}
            style={({ pressed }) => [
              styles.fridgeCard,
              inventoryLoading && styles.loadingContent,
              pressed && !inventoryLoading && styles.pressed,
            ]}
          >
            <View style={styles.fridgeIconCircle}>
              <Fridge color="#7866F4" height={30} width={30} />
            </View>
            <View style={styles.fridgeCopy}>
              <Text style={styles.fridgeTitle}>
                <Text style={styles.fridgeTitleEmphasis}>
                  냉장고 재료 {fridgeIngredients.length}개
                </Text>{' '}
                반영중
              </Text>
            </View>
            <View style={styles.manageRow}>
              <Text style={styles.manageText}>관리하기</Text>
              <Right color="#767676" height={15} width={15} />
            </View>
          </Pressable>
        </View>
      </ScrollView>
      <CustomScrollIndicator {...indicator.indicatorProps} color="rgba(120, 102, 244, 0.56)" />
      <Modal
        visible={showDates}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDates(false)}
      >
        <View style={main.overlay}>
          <View style={main.dateDialog}>
            <Text style={styles.mealSectionTitle}>날짜 선택</Text>
            <ScrollView>
              {Array.from({ length: 13 }, (_, i) => i - 6).map((offset) => (
                <Pressable
                  accessibilityRole="button"
                  key={offset}
                  onPress={() => {
                    moveSelectedDate(offset - selectedDateOffset);
                    setShowDates(false);
                  }}
                  style={[
                    main.dateOption,
                    offset === selectedDateOffset && { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <Text style={main.dateSelectText}>
                    {getDateCopy(addDays(today, offset), offset).date}
                    {offset === 0 ? ' · 오늘' : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowDates(false)}
              style={main.dateOption}
            >
              <Text style={main.dateSelectText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <FridgeManagerSheets
        activeSheet={activeSheet}
        ingredients={fridgeIngredients}
        onActiveSheetChange={setActiveSheet}
        onIngredientAdd={addInventoryIngredient}
        onIngredientDelete={deleteInventoryIngredients}
      />
      <MealRecordSheets
        initialDraft={
          recordingMealId ? mealRecordsByDate[selectedDateKey]?.[recordingMealId] : undefined
        }
        mealId={recordingMealId}
        onClose={() => setRecordingMealId(null)}
        onComplete={completeMealRecord}
        visible={recordingMealId !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FA', overflow: 'hidden' },
  webViewport: { height: '100%', maxHeight: '100%', minHeight: 0 },
  webScrollViewport: { flex: 1, maxHeight: '100%', minHeight: 0 },
  canvasSlot: { position: 'relative', width: '100%' },
  canvas: {
    alignSelf: 'flex-start',
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },
  screenTitle: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    letterSpacing: 1.5,
    lineHeight: 20,
    textAlign: 'center',
    width: referenceWidth,
  },
  hero: {
    height: 118,
    marginTop: 11,
    paddingLeft: 21,
    position: 'relative',
  },
  heroCopy: { zIndex: 2 },
  strategyBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8E8FF',
    borderRadius: 20,
    height: 20,
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  strategyBadgeText: {
    color: '#7866F4',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
  },
  heroTitle: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 20,
    lineHeight: 27,
    marginTop: 5,
  },
  primaryText: { color: '#7866F4' },
  heroDescription: {
    color: '#767676',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 9,
  },
  heroImage: { height: 100, position: 'absolute', right: 18, top: 6, width: 165 },
  sectionStack: { gap: 10, marginHorizontal: 21 },
  fridgeCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EAE9',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    height: 70,
    paddingHorizontal: 17,
  },
  fridgeIconCircle: {
    alignItems: 'center',
    backgroundColor: '#E8E8FF',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fridgeCopy: { flex: 1, marginLeft: 11, justifyContent: 'center' },
  fridgeTitle: { color: '#000000', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  fridgeTitleEmphasis: { color: '#7866F4', fontFamily: fontFamilies.pretendardSemiBold },
  manageRow: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  manageText: { color: '#767676', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 11.5 },
  dateCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EAE9',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    height: 80,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  arrowButton: {
    alignItems: 'center',
    backgroundColor: '#E8E8FF',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  arrowDisabled: { opacity: 0.3 },
  loadingContent: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  selectedDate: {
    alignItems: 'center',
    backgroundColor: '#E8E8FF',
    borderRadius: 10,
    gap: 5,
    height: 70,
    justifyContent: 'center',
    width: 240,
  },
  selectedDateLabel: {
    color: '#7866F4',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  selectedDateValue: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 20,
  },
  selectedDateLine: {
    backgroundColor: '#7866F4',
    borderRadius: 1,
    height: 2,
    width: 35,
  },
  nutritionCard: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  nutritionTitle: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 22,
    lineHeight: 27,
  },
  nutritionInner: { gap: 17, marginTop: 10, width: '100%' },
  calorieGoal: { gap: 10 },
  calorieGoalTop: { alignItems: 'center', flexDirection: 'row', gap: 7, width: '100%' },
  nutritionIcon: {
    alignItems: 'center',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  calorieValue: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 24,
    lineHeight: 30,
    flex: 1,
  },
  calorieTarget: {
    color: '#767676',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  calorieTrack: {
    backgroundColor: '#E5EAE9',
    borderRadius: 3,
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
  calorieFill: { borderRadius: 5, height: 10 },
  macroGoals: { gap: 10 },
  macroGoal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    height: 43,
    paddingHorizontal: 5,
  },
  macroCopy: { alignSelf: 'stretch', gap: 12, justifyContent: 'center' },
  macroLabel: {
    color: '#7866F4',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 17,
  },
  macroValue: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    lineHeight: 20,
  },
  macroTarget: {
    color: '#767676',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    lineHeight: 20,
  },
  mealSectionTitle: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 22,
    marginBottom: 1,
    marginTop: 4,
  },
  mealList: { gap: 10 },
  mealLoadMessage: {
    color: '#767676',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    paddingVertical: 16,
    textAlign: 'center',
  },
  mealErrorCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EAE9',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  mealErrorText: {
    color: '#767676',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    textAlign: 'center',
  },
  mealRetryText: { color: '#7866F4', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  mealCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EAE9',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 116,
    overflow: 'hidden',
    position: 'relative',
  },
  mealCardEaten: { borderColor: '#BAB1FF' },
  mealCardModified: { borderColor: '#5FA0FB' },
  mealCardSkipped: { borderColor: '#E5EAE9' },
  mealSummary: { flexDirection: 'row', gap: 13, height: 110, width: 350 },
  mealRight: { flex: 1, gap: 17, height: 110 },
  mealMetadataRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mealMetadataLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 130,
  },
  mealNameRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  mealMetadataDivider: { backgroundColor: '#E5EAE9', height: 12, width: 1 },
  mealTitle: { fontFamily: fontFamilies.pretendardBold, fontSize: 15 },
  mealKcal: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
  },
  statusPressable: { borderRadius: 10 },
  statusBadge: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 3,
    height: 20,
    justifyContent: 'center',
    width: 75,
  },
  statusBadgeText: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  recommendedBadge: { backgroundColor: '#E8E8FF' },
  recommendedBadgeText: { color: '#7866F4' },
  eatenBadge: { backgroundColor: '#E8E8FF' },
  eatenBadgeText: { color: '#7866F4' },
  modifiedBadge: { backgroundColor: '#E2EEFF' },
  modifiedBadgePressed: { backgroundColor: '#C9DDFF' },
  modifiedBadgeText: { color: '#0066FF' },
  skippedBadge: { backgroundColor: '#EAEAEA' },
  skippedBadgeText: { color: '#767676' },
  skippedContent: { opacity: 0.5 },
  mealImage: { backgroundColor: '#F3F5F4', borderRadius: 10, height: 110, width: 110 },
  mealBottomRow: { flex: 1, flexDirection: 'row' },
  mealCopy: { flex: 1, justifyContent: 'space-between' },
  foodsText: {
    color: '#464646',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 17,
    lineHeight: 21,
    width: 200,
  },
  chevronArea: { alignItems: 'center', alignSelf: 'stretch', paddingTop: 10, width: 25 },
  chevronCircle: {
    alignItems: 'center',
    backgroundColor: '#E8E8FF',
    borderRadius: 12.5,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  expandedClip: { overflow: 'hidden' },
  expandedMeasure: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 122,
    opacity: 0,
    zIndex: -1,
  },
  expandedContent: { gap: 12, paddingTop: 12 },
  mealDivider: {
    backgroundColor: '#E5EAE9',
    height: 1,
    width: '100%',
  },
  fridgeDetailCard: {
    backgroundColor: '#F4F3FF',
    borderRadius: 10,
    height: 65,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fridgeDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  detailTitle: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  fridgeDetailTitle: { color: '#7866F4' },
  detailBadge: {
    alignItems: 'center',
    backgroundColor: '#E8E8FF',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 50,
  },
  detailBadgeText: { color: '#7866F4', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  fridgeIngredientRow: {
    alignItems: 'center',
    backgroundColor: '#F7FCFB',
    borderRadius: 7,
    flexDirection: 'row',
    height: 25,
    marginTop: 5,
    paddingLeft: 20,
  },
  fridgeIngredient: { color: '#464646', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  intakeCard: { backgroundColor: '#FBF7F1', borderRadius: 10, gap: 10, padding: 10 },
  intakeTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  intakeTitle: { color: '#5C4D3C' },
  intakeBadge: {
    alignItems: 'center',
    backgroundColor: '#EFECE7',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 50,
  },
  intakeBadgeText: { color: '#767676', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  intakeItems: {
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    columnGap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    width: '100%',
  },
  intakeItem: {
    alignItems: 'flex-start',
    backgroundColor: '#FCFBF9',
    borderRadius: 10,
    flexBasis: '48.4%',
    flexGrow: 0,
    flexShrink: 0,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 10,
    maxWidth: '48.4%',
  },
  intakeName: {
    color: '#767676',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 17,
  },
  intakeAmount: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    lineHeight: 18,
    marginTop: 2,
    width: '100%',
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: {
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 0.5,
    flexDirection: 'row',
    gap: 4,
    height: 32,
    justifyContent: 'center',
    width: 103,
  },
  actionWide: { width: 135 },
  actionDisabled: { opacity: 0.42 },
  actionEaten: { backgroundColor: '#FFFFFF', borderColor: '#7866F4' },
  actionEatenSelected: { backgroundColor: '#E8E8FF', borderColor: '#7866F4' },
  actionEatenPressed: { backgroundColor: '#E8E8FF', borderColor: '#7866F4' },
  actionModified: { backgroundColor: '#FFFFFF', borderColor: '#0066FF' },
  actionModifiedSelected: { backgroundColor: '#E2EEFF', borderColor: '#0066FF' },
  actionModifiedPressed: { backgroundColor: '#E2EEFF', borderColor: '#0066FF' },
  actionSkipped: { backgroundColor: '#FFFFFF', borderColor: '#727272' },
  actionSkippedSelected: { backgroundColor: '#F4F4F4', borderColor: '#727272' },
  actionSkippedPressed: { backgroundColor: '#F4F4F4', borderColor: '#727272' },
  actionText: { fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  actionEatenText: { color: '#7866F4' },
  actionModifiedText: { color: '#0066FF' },
  actionSkippedText: { color: '#727272' },

  selectedCardBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    borderWidth: 2,
    zIndex: 10,
  },
  mealCardWeb: {
    overflow: 'hidden',
  },
  eatenCardBorder: {
    borderColor: '#BAB1FF',
  },
  modifiedCardBorder: {
    borderColor: '#5FA0FB',
  },
});

const main = StyleSheet.create({
  content: { marginHorizontal: 21, marginTop: 25, gap: 15 },
  heroImage: { position: 'absolute', width: 160, height: 130, right: 0, top: 5 },
  heroTitle: {
    fontFamily: fontFamilies.pretendardBold,
    color: colors.textWhite,
    fontSize: 24,
    lineHeight: 27,
    maxWidth: 220,
  },
  accent: { color: colors.primaryMedium },
  heroDescription: {
    fontSize: 14,
    fontFamily: fontFamilies.pretendardMedium,
    color: colors.textWhiteSecondary,
    marginTop: 10,
  },
  dateControls: { marginTop: 'auto', gap: 8 },
  today: {
    borderWidth: 0.5,
    borderColor: colors.primaryLight,
    borderRadius: 20,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  todayText: { fontSize: 13, color: colors.primaryLight },
  dateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 16,
    fontFamily: fontFamilies.pretendardSemiBold,
    color: colors.primaryMedium,
    flexShrink: 1,
  },
  dateSelect: {
    marginLeft: 'auto',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    padding: 9,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dateSelectText: {
    fontSize: 14,
    fontFamily: fontFamilies.pretendardSemiBold,
    color: colors.primary,
  },
  mealChips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  mealChip: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#CACACA',
    backgroundColor: '#FFF',
    alignItems: 'center',
    paddingVertical: 8,
  },
  recordedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  mealChipText: { fontSize: 17, color: colors.textSecondary },
  recordedChipText: { color: '#FFF' },
  percentage: { fontSize: 18, color: colors.primary, fontFamily: fontFamilies.pretendardMedium },
  mealAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 10 },
  mealTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },
  mealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primaryLight,
  },
  mealKcal: { fontSize: 17, color: colors.textBody, fontFamily: fontFamilies.pretendardMedium },
  mealBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  foods: {
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textBody,
  },
  record: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  recordText: { fontSize: 15, color: colors.primary },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 30 },
  dateDialog: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, maxHeight: '75%', gap: 12 },
  dateOption: { padding: 14, borderRadius: 10, alignItems: 'center' },
});
