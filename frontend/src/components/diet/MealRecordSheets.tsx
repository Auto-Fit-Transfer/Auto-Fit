import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  type TextProps,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ArrowRightIcon from '@/assets/icons/common/ArrowRight_Short.svg';
import BackIcon from '@/assets/icons/common/chevrons/Left.svg';
import ChevronRightIcon from '@/assets/icons/common/chevrons/Right.svg';
import TrashIcon from '@/assets/icons/common/Trash.svg';
import CloseIcon from '@/assets/icons/common/X.svg';
import BmrIcon from '@/assets/icons/data/BMR.svg';
import FatIcon from '@/assets/icons/data/Fat.svg';
import GalleryIcon from '@/assets/icons/deco/Image.svg';
import PlantIcon from '@/assets/icons/deco/Plant.svg';
import FishSimpleIcon from '@/assets/icons/food/FishSimple.svg';
import CameraIcon from '@/assets/icons/system/Camera_Fill.svg';
import CheckCircleIcon from '@/assets/icons/system/CheckCircle.svg';
import CheckFatIcon from '@/assets/icons/system/Check_Fat.svg';
import ClockIcon from '@/assets/icons/input/Clock.svg';
import LightbulbIcon from '@/assets/icons/system/Lightbulb.svg';
import PencilIcon from '@/assets/icons/feature/Pencil_Line.svg';
import SearchIcon from '@/assets/icons/input/MagnifyingGlass.svg';
import WarningFillIcon from '@/assets/icons/system/WarningCircle_Fill.svg';
import { AppBottomSheet, CustomScrollIndicator, useCustomScrollIndicator } from '@/src/components/common';
import { useTemporaryAdjustmentProgress } from '@/src/features/exercise/useTemporaryAdjustmentProgress';
import { colors, fontFamilies } from '@/src/theme';
import { analyzeRecordedMealMock } from '@/src/utils/diet/analyzeRecordedMealMock';

function Text(props: TextProps) {
  return <NativeText allowFontScaling={false} maxFontSizeMultiplier={1} {...props} />;
}

export type RecordedFood = {
  id: string;
  name: string;
  serving: number;
  amount: number;
  unit: string;
  kcal?: number;
  carbs?: number;
  protein?: number;
  fat?: number;
  databaseId?: string;
  baseAmount?: number;
  isCustom?: boolean;
};

export type RecordedMealData = {
  mealId: string;
  mealTime: string;
  photoUri: string | null;
  photoFileName?: string | null;
  photoFileSize?: number | null;
  photoMimeType?: string | null;
  foods: RecordedFood[];
  kcal: number;
  tags: string[];
  note: string;
  usedIngredients: string[];
  intake: [string, string][];
};

export type MealRecordDraft = RecordedMealData;

type NutrientKey = 'kcal' | 'carbs' | 'protein' | 'fat';
type MainStep = 'photo' | 'analysis' | 'review' | 'result';
type SheetView = MainStep | 'edit' | 'replace' | 'add';
type AnalysisType = 'caution' | 'good';

type FoodDatabaseItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
};

type FoodSelection =
  | { kind: 'database'; food: FoodDatabaseItem }
  | { kind: 'custom'; name: string };

type FoodShotAnalysisResult = {
  type: AnalysisType;
  title: string;
  description: string;
  sectionTitle: string;
  reasons: string[];
};

type Props = {
  visible: boolean;
  mealId: string | null;
  initialDraft?: MealRecordDraft;
  onClose: () => void;
  onComplete: (draft: MealRecordDraft) => Promise<boolean>;
};

const MOCK_ANALYSIS_TYPE: AnalysisType = 'caution';
const RESULT_LOADING_MS = 1400;
const STEP_SHEET_HEIGHT = 620;
const SUB_SHEET_HEIGHT = 730;
const STEP_SHEET_BODY_HEIGHT = 500;
const SUB_SHEET_BODY_HEIGHT = 610;
const recognizedListViewportHeight = 140;
const editPresetRatios = [1, 0.5, 0.7] as const;
const nutritionKeys: NutrientKey[] = ['kcal', 'carbs', 'protein', 'fat'];
const foodShotHeaderControlSize = 30;
const foodShotBackIconSize = 24;
const nutritionLabels: Record<NutrientKey, string> = {
  kcal: '칼로리',
  carbs: '탄수화물',
  protein: '단백질',
  fat: '지방',
};
const mockAnalysisResults: Record<AnalysisType, FoodShotAnalysisResult> = {
  caution: {
    type: 'caution',
    title: '조금 주의가 필요한 식단이에요',
    description: '탄수화물과 나트륨은 높은 편이고, 단백질은 다소 부족해 보완이 필요해요.',
    sectionTitle: '추천 행동',
    reasons: [
      '김치 양이나 소스를 조금 줄여보세요.',
      '계란 후라이나 닭가슴살을 곁들이면 더 좋아요.',
      '채소를 곁들이면 영양 균형을 맞추는 데 도움이 돼요.',
    ],
  },
  good: {
    type: 'good',
    title: '나에게 잘 맞는 식단이에요',
    description: '단백질과 영양 균형이 적절하고, 현재 식단 목표에 잘 맞는 구성이에요.',
    sectionTitle: '이렇게 판단했어요',
    reasons: [
      '근육 유지에 좋은 단백질이 풍부해요.',
      '탄수화물, 단백질, 지방의 균형이 양호해요.',
      '한 끼 식사 목표 범위에 적절한 열량이에요.',
    ],
  },
};

const foodDatabase: FoodDatabaseItem[] = [
  {
    id: 'db-kimchi-rice',
    name: '김치볶음밥',
    amount: 300,
    unit: 'g',
    kcal: 480,
    carbs: 72,
    protein: 14,
    fat: 13,
  },
  {
    id: 'db-kimchi-stew',
    name: '김치찌개',
    amount: 200,
    unit: 'g',
    kcal: 60,
    carbs: 8,
    protein: 5,
    fat: 2,
  },
  {
    id: 'db-cabbage-kimchi',
    name: '배추김치',
    amount: 100,
    unit: 'g',
    kcal: 25,
    carbs: 4,
    protein: 2,
    fat: 0,
  },
  {
    id: 'db-kimchi-pancake',
    name: '김치전',
    amount: 150,
    unit: 'g',
    kcal: 190,
    carbs: 28,
    protein: 5,
    fat: 7,
  },
  {
    id: 'db-chicken-salad',
    name: '닭가슴살 샐러드',
    amount: 200,
    unit: 'g',
    kcal: 210,
    carbs: 18,
    protein: 30,
    fat: 5,
  },
  {
    id: 'db-seaweed-soup',
    name: '미역국',
    amount: 200,
    unit: 'g',
    kcal: 80,
    carbs: 9,
    protein: 4,
    fat: 3,
  },
  {
    id: 'db-apple',
    name: '사과',
    amount: 200,
    unit: 'g',
    kcal: 104,
    carbs: 28,
    protein: 1,
    fat: 0,
  },
  {
    id: 'db-milk',
    name: '우유',
    amount: 200,
    unit: 'ml',
    kcal: 122,
    carbs: 10,
    protein: 6,
    fat: 7,
  },
];

const cloneDraft = (draft: MealRecordDraft): MealRecordDraft => ({
  ...draft,
  foods: draft.foods.map((food) => ({ ...food })),
  tags: [...draft.tags],
  usedIngredients: [...draft.usedIngredients],
  intake: draft.intake.map(([name, amount]) => [name, amount]),
});

const createEmptyDraft = (mealId: string): MealRecordDraft => ({
  mealId,
  mealTime: '12:00',
  photoUri: null,
  foods: [],
  kcal: 0,
  tags: [],
  note: '',
  usedIngredients: [],
  intake: [],
});

const databaseFoodToRecorded = (food: FoodDatabaseItem, id = `food-${Date.now()}`): RecordedFood => ({
  id,
  databaseId: food.id,
  name: food.name,
  serving: 1,
  amount: food.amount,
  baseAmount: food.amount,
  unit: food.unit,
  kcal: food.kcal,
  carbs: food.carbs,
  protein: food.protein,
  fat: food.fat,
  isCustom: false,
});

const createRecognizedFoods = (): RecordedFood[] => [
  databaseFoodToRecorded(foodDatabase[0], `recognized-rice-${Date.now()}`),
  databaseFoodToRecorded(foodDatabase[4], `recognized-salad-${Date.now()}`),
  databaseFoodToRecorded(foodDatabase[5], `recognized-soup-${Date.now()}`),
];

const createCustomFood = (name: string, id = `manual-${Date.now()}`): RecordedFood => ({
  id,
  name,
  serving: 0,
  amount: 0,
  baseAmount: 300,
  unit: 'g',
  isCustom: true,
});

const createEmptyFoodDraft = (): RecordedFood => ({
  id: `pending-${Date.now()}`,
  name: '',
  serving: 1,
  amount: 300,
  baseAmount: 300,
  unit: 'g',
  isCustom: true,
});

const onlyNumeric = (value: string) => value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

const scaleFoodToAmount = (food: RecordedFood, amount: number): RecordedFood => {
  const safeAmount = Math.max(0, Math.round(amount));
  const previousAmount = Math.max(1, food.amount || food.baseAmount || 1);
  const ratio = safeAmount / previousAmount;
  const scale = (value?: number) =>
    value === undefined ? undefined : Math.max(0, Math.round(value * ratio * 10) / 10);

  return {
    ...food,
    amount: safeAmount,
    serving: Math.round((safeAmount / Math.max(1, food.baseAmount ?? 300)) * 10) / 10,
    kcal: scale(food.kcal),
    carbs: scale(food.carbs),
    protein: scale(food.protein),
    fat: scale(food.fat),
  };
};

export const formatRecordedFoodAmount = (food: RecordedFood) => {
  if (food.amount <= 0) return '';
  return food.unit === '인분' ? `${food.serving}인분` : `${food.amount}${food.unit}`;
};

function FoodShotStepHeader({
  currentStep,
  onBack,
  onClose,
}: {
  currentStep: number;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.chrome}>
      <View style={styles.dragHandle} />
      <View style={styles.stepRow}>
        {[1, 2, 3, 4].map((step, index) => (
          <View key={step} style={styles.stepSegment}>
            {index > 0 ? (
              <View style={[styles.stepLine, step <= currentStep && styles.stepLineActive]} />
            ) : null}
            <View
              style={[
                styles.stepCircle,
                step < currentStep && styles.stepCircleComplete,
                step === currentStep && styles.stepCircleActive,
              ]}
            >
              <Text
                style={[
                  styles.stepText,
                  step < currentStep && styles.stepTextComplete,
                  step === currentStep && styles.stepTextActive,
                ]}
              >
                {step < currentStep ? '✓' : step}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {onBack ? (
        <Pressable accessibilityLabel="이전" hitSlop={8} onPress={onBack} style={styles.backButton}>
          <BackIcon color={colors.primary} height={foodShotBackIconSize} width={foodShotBackIconSize} />
        </Pressable>
      ) : null}
      <Pressable accessibilityLabel="닫기" hitSlop={8} onPress={onClose} style={styles.closeButton}>
        <CloseIcon color={colors.primary} fill={colors.primary} height={17} width={17} />
      </Pressable>
    </View>
  );
}

function FoodShotSubSheetHeader({
  onBack,
  onClose,
  title,
}: {
  onBack: () => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <View style={styles.subSheetChrome}>
      <View style={styles.dragHandle} />
      <Text maxFontSizeMultiplier={1} style={styles.subSheetTitle}>{title}</Text>
      <Pressable accessibilityLabel="이전" hitSlop={8} onPress={onBack} style={styles.subSheetBackButton}>
        <BackIcon color={colors.primary} height={foodShotBackIconSize} width={foodShotBackIconSize} />
      </Pressable>
      <Pressable accessibilityLabel="닫기" hitSlop={8} onPress={onClose} style={styles.subSheetCloseButton}>
        <CloseIcon color={colors.primary} fill={colors.primary} height={17} width={17} />
      </Pressable>
    </View>
  );
}

function AmountStepIcon({ operation }: { operation: 'decrease' | 'increase' }) {
  return (
    <Svg height={16} viewBox="0 0 16 16" width={16}>
      <Line
        stroke={colors.primary}
        strokeLinecap="round"
        strokeWidth={1.8}
        x1={3}
        x2={13}
        y1={8}
        y2={8}
      />
      {operation === 'increase' ? (
        <Line
          stroke={colors.primary}
          strokeLinecap="round"
          strokeWidth={1.8}
          x1={8}
          x2={8}
          y1={3}
          y2={13}
        />
      ) : null}
    </Svg>
  );
}

function PrimaryButton({
  children,
  disabled = false,
  gradient = false,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  gradient?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        gradient && styles.gradientButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {gradient && !disabled ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="foodShotCtaGradient" x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor="#2FAF96" />
              <Stop offset="1" stopColor="#49CDB1" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#foodShotCtaGradient)" height="100%" rx={10} width="100%" />
        </Svg>
      ) : null}
      {typeof children === 'string' ? <Text style={styles.primaryButtonText}>{children}</Text> : children}
    </Pressable>
  );
}

function OutlineAction({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.outlineAction, pressed && styles.pressed]}>
      {icon}
      <Text maxFontSizeMultiplier={1} style={styles.outlineActionText}>{label}</Text>
    </Pressable>
  );
}

function LoadingDots() {
  const [animations] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));

  useEffect(() => {
    const loops = animations.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 130),
          Animated.timing(value, {
            duration: 260,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(value, {
            duration: 260,
            easing: Easing.in(Easing.cubic),
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.delay((2 - index) * 130),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [animations]);

  return (
    <View style={styles.loadingDots}>
      {animations.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.loadingDot,
            {
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
                { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.08] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function ProcessingDots() {
  const [activeDot, setActiveDot] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setActiveDot((value) => (value + 1) % 10), 90);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.processingDots}>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;
        const distance = (index - activeDot + 10) % 10;
        return (
          <View
            key={index}
            style={[
              styles.processingDot,
              {
                left: 9 + Math.cos(angle) * 7,
                opacity: distance === 0 ? 1 : distance === 1 ? 0.62 : 0.2,
                top: 9 + Math.sin(angle) * 7,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function FoodAnalysisStep({ imageUri, onComplete }: { imageUri: string; onComplete: () => void }) {
  const progress = useTemporaryAdjustmentProgress();
  const [pulse] = useState(() => new Animated.Value(0.55));
  const completionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const size = 225;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * 2 * radius;
  const percentage = Math.round(progress * 100);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          toValue: 0.55,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    if (progress < 1 || completionRef.current) return;
    completionRef.current = setTimeout(onComplete, 320);
    return () => {
      if (completionRef.current) clearTimeout(completionRef.current);
      completionRef.current = null;
    };
  }, [onComplete, progress]);

  const stageIndex = progress >= 1 ? 3 : progress >= 0.66 ? 2 : progress >= 0.33 ? 1 : 0;
  const stages = ['음식 종류 인식', '칼로리 · 영양 성분 분석', '사용자 건강 데이터와 비교'];

  return (
    <View style={styles.analysisContent}>
      <Text style={styles.screenTitle}>식단 분석중</Text>
      <View style={styles.analysisVisual}>
        <Image source={{ uri: imageUri }} style={styles.analysisImage} />
        <Svg height={size} style={styles.analysisProgress} width={size}>
          <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={colors.primaryLight} strokeWidth={strokeWidth} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            origin={`${size / 2}, ${size / 2}`}
            r={radius}
            rotation="-90"
            stroke={colors.primary}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        </Svg>
      </View>
      <Text style={styles.analysisPercentage}>
        <Text style={styles.analysisPercentageNumber}>{percentage}</Text>
        <Text style={styles.analysisPercentageUnit}>%</Text>
      </Text>
      <View style={styles.analysisStages}>
        {stages.map((label, index) => {
          const completed = index < stageIndex;
          const processing = index === stageIndex && stageIndex < stages.length;
          return (
            <View key={label} style={styles.analysisStageRow}>
              {completed ? (
                <CheckCircleIcon color={colors.primaryDark} height={21} width={21} />
              ) : processing ? (
                <ProcessingDots />
              ) : (
                <ClockIcon color={colors.textDisabled} height={21} width={21} />
              )}
              <Text
                style={[
                  styles.analysisStageText,
                  processing && styles.analysisStageTextActive,
                  !completed && !processing && styles.analysisStageTextPending,
                ]}
              >
                {label} {completed ? '완료' : processing ? '분석중' : '대기중'}
              </Text>
            </View>
          );
        })}
      </View>
      <Animated.View style={[styles.waitNotice, { opacity: pulse }]}>
        <LightbulbIcon color={colors.primary} fill={colors.primary} height={17} width={17} />
        <Text style={styles.waitNoticeText}>잠시만 기다려 주세요</Text>
      </Animated.View>
    </View>
  );
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const normalizedQuery = query.trim();
  const index = name.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (!normalizedQuery || index < 0) return <Text style={styles.searchResultName}>{name}</Text>;

  return (
    <Text style={styles.searchResultName}>
      {name.slice(0, index)}
      <Text style={styles.searchMatch}>{name.slice(index, index + normalizedQuery.length)}</Text>
      {name.slice(index + normalizedQuery.length)}
    </Text>
  );
}

function FoodSearch({
  onSelect,
  onSearchStart,
  searchText,
  selectionMade = false,
  setSearchText,
}: {
  onSelect: (selection: FoodSelection) => void;
  onSearchStart?: () => void;
  searchText: string;
  selectionMade?: boolean;
  setSearchText: (value: string) => void;
}) {
  const indicator = useCustomScrollIndicator({ showInitially: true });
  const query = searchText.trim();
  const results = useMemo(
    () =>
      query
        ? foodDatabase
            .filter((food) => food.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
            .slice(0, 10)
        : [],
    [query],
  );

  return (
    <View style={styles.searchArea}>
      <View style={styles.searchField}>
        <SearchIcon color={colors.textSecondary} fill={colors.textSecondary} height={20} width={20} />
        <TextInput
          allowFontScaling={false}
          autoFocus
          onChangeText={(value) => {
            onSearchStart?.();
            setSearchText(value);
          }}
          onFocus={onSearchStart}
          placeholder="음식명을 입력해 주세요. (예: 김치볶음밥)"
          placeholderTextColor={colors.textDisabled}
          style={styles.searchInput}
          value={searchText}
        />
      </View>
      {query && !selectionMade ? (
        <View style={styles.autocompleteOverlay}>
          {results.length > 0 ? (
            <View style={styles.autocompleteListWrap}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                onContentSizeChange={indicator.onContentSizeChange}
                onLayout={indicator.onLayout}
                onMomentumScrollBegin={indicator.onMomentumScrollBegin}
                onMomentumScrollEnd={indicator.onMomentumScrollEnd}
                onScroll={indicator.onScroll}
                onScrollBeginDrag={indicator.onScrollBeginDrag}
                onScrollEndDrag={indicator.onScrollEndDrag}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                {results.map((food) => (
                  <Pressable
                    key={food.id}
                    onPress={() => {
                      Keyboard.dismiss();
                      onSelect({ kind: 'database', food });
                    }}
                    style={styles.searchResultRow}
                  >
                    <HighlightedName name={food.name} query={query} />
                    <Text style={styles.searchResultKcal}>{food.kcal} kcal</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <CustomScrollIndicator
                {...indicator.indicatorProps}
                color="#49CDB1"
                rightInset={2}
              />
            </View>
          ) : (
            <View style={styles.emptySearch}>
              <SearchIcon color={colors.textDisabled} height={30} width={30} />
              <Text style={styles.emptySearchText}>검색 결과가 없어요.</Text>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  onSelect({ kind: 'custom', name: query });
                }}
                style={styles.customFoodButton}
              >
                <Text style={styles.customFoodButtonText}>입력한 음식명으로 등록하기</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function FoodRecommendationList({
  onSelect,
  selected,
}: {
  onSelect: (selection: FoodSelection) => void;
  selected: FoodSelection | null;
}) {
  const indicator = useCustomScrollIndicator({ showInitially: false });
  return (
    <View style={styles.recommendationListWrap}>
      <ScrollView
        nestedScrollEnabled
        onContentSizeChange={indicator.onContentSizeChange}
        onLayout={indicator.onLayout}
        onMomentumScrollBegin={indicator.onMomentumScrollBegin}
        onMomentumScrollEnd={indicator.onMomentumScrollEnd}
        onScroll={indicator.onScroll}
        onScrollBeginDrag={indicator.onScrollBeginDrag}
        onScrollEndDrag={indicator.onScrollEndDrag}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.recommendationListContent}>
          {foodDatabase.slice(0, 10).map((food, index) => {
            const isSelected = selected?.kind === 'database' && selected.food.id === food.id;
            return (
              <Pressable
                key={food.id}
                onPress={() => onSelect({ kind: 'database', food })}
                style={styles.recommendationCard}
              >
                <View style={styles.recommendationBadge}><Text style={styles.recommendationBadgeText}>{index + 1}</Text></View>
                <View style={styles.recommendationCopy}>
                  <Text style={styles.recommendationName}>{food.name}</Text>
                  <Text style={styles.recommendationMeta}>1인분 · {food.amount}{food.unit} · {food.kcal} kcal</Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>{isSelected ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <CustomScrollIndicator {...indicator.indicatorProps} color="#49CDB1" rightInset={2} />
    </View>
  );
}

function NutrientIcon({ nutrient }: { nutrient: NutrientKey }) {
  const iconProps = { color: colors.primaryDark, height: 28, width: 28 };

  if (nutrient === 'kcal') return <BmrIcon {...iconProps} />;
  if (nutrient === 'carbs') return <PlantIcon {...iconProps} />;
  if (nutrient === 'protein') return <FishSimpleIcon {...iconProps} />;
  return <FatIcon {...iconProps} />;
}

function NutritionPanel({
  food,
  macroRowRef,
  valueNodes,
}: {
  food: RecordedFood;
  macroRowRef?: RefObject<View | null>;
  valueNodes?: Partial<Record<NutrientKey, ReactNode>>;
}) {
  const renderValue = (key: NutrientKey) =>
    valueNodes?.[key] ?? (
      <Text style={key === 'kcal' ? styles.totalKcalValue : styles.totalNutritionValue}>
        {food[key] === undefined ? '-' : Math.round(food[key] ?? 0)}
      </Text>
    );

  return (
    <View>
      <View style={styles.totalKcalBox}>
        <NutrientIcon nutrient="kcal" />
        <View style={styles.nutritionValueRow}>
          {renderValue('kcal')}
          <Text style={styles.totalKcalUnit}>kcal</Text>
        </View>
      </View>
      <View ref={macroRowRef} style={styles.totalNutritionGrid}>
        {(['carbs', 'protein', 'fat'] as NutrientKey[]).map((key, index) => (
          <Fragment key={key}>
            {index > 0 ? <View style={styles.nutritionDivider} /> : null}
            <View style={styles.totalNutritionItem}>
              <NutrientIcon nutrient={key} />
              <View style={styles.nutritionTextColumn}>
                <Text style={styles.totalNutritionLabel}>{nutritionLabels[key]}</Text>
                <View style={styles.nutritionValueRow}>
                  {renderValue(key)}
                  <Text style={styles.totalNutritionUnit}>g</Text>
                </View>
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function NutritionEditor({
  disabled,
  food,
  macroRowRef,
  onChange,
  onEditingChange,
  onInputFocus,
  onRegisterApply,
}: {
  disabled?: boolean;
  food: RecordedFood;
  macroRowRef?: RefObject<View | null>;
  onChange: (food: RecordedFood) => void;
  onEditingChange: (editing: boolean) => void;
  onInputFocus?: () => void;
  onRegisterApply?: (apply: (() => RecordedFood | null) | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<NutrientKey, string>>({
    kcal: food.kcal === undefined ? '' : String(food.kcal),
    carbs: food.carbs === undefined ? '' : String(food.carbs),
    protein: food.protein === undefined ? '' : String(food.protein),
    fat: food.fat === undefined ? '' : String(food.fat),
  });
  const valuesRef = useRef(values);

  const updateValue = (key: NutrientKey, value: string) => {
    const nextValues = { ...valuesRef.current, [key]: onlyNumeric(value) };
    valuesRef.current = nextValues;
    setValues(nextValues);
  };

  const startEditing = () => {
    if (disabled) return;
    const nextValues = {
      kcal: food.kcal === undefined ? '' : String(food.kcal),
      carbs: food.carbs === undefined ? '' : String(food.carbs),
      protein: food.protein === undefined ? '' : String(food.protein),
      fat: food.fat === undefined ? '' : String(food.fat),
    };
    valuesRef.current = nextValues;
    setValues(nextValues);
    setEditing(true);
    onEditingChange(true);
  };

  const applyNutritionEdits = useCallback((): RecordedFood | null => {
    const parsed = Object.fromEntries(
      nutritionKeys.map((key) => {
        const value = valuesRef.current[key].trim();
        return [key, value === '' ? food[key] : Number(value)];
      }),
    ) as Partial<Record<NutrientKey, number>>;
    if (
      nutritionKeys.some(
        (key) => valuesRef.current[key].trim() !== '' && !Number.isFinite(parsed[key]),
      )
    ) {
      Alert.alert('영양 정보를 확인해 주세요', '숫자 형식이 올바르지 않은 항목이 있어요.');
      return null;
    }

    const nextFood = { ...food, ...parsed };
    onChange(nextFood);
    setEditing(false);
    onEditingChange(false);
    Keyboard.dismiss();
    return nextFood;
  }, [food, onChange, onEditingChange]);

  const confirmEditing = () => {
    applyNutritionEdits();
  };

  useEffect(() => {
    onRegisterApply?.(applyNutritionEdits);
    return () => onRegisterApply?.(null);
  }, [applyNutritionEdits, onRegisterApply]);

  useEffect(() => () => onEditingChange(false), [onEditingChange]);

  return (
    <View style={styles.nutritionSection}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeading}>영양 정보</Text>
        <Pressable
          onPress={editing ? confirmEditing : startEditing}
          style={[styles.editNutritionButton, editing && styles.confirmNutritionButton]}
        >
          {editing ? (
            <CheckFatIcon color={colors.primaryDark} height={17} width={17} />
          ) : (
            <PencilIcon color="#3E7DDD" fill="#3E7DDD" height={17} width={17} />
          )}
          <Text style={[styles.editNutritionText, editing && styles.confirmNutritionText]}>
            {editing ? '확인' : '수정'}
          </Text>
        </Pressable>
      </View>
      <NutritionPanel
        food={food}
        macroRowRef={macroRowRef}
        valueNodes={Object.fromEntries(
          nutritionKeys.map((key) => [
            key,
            editing ? (
              <TextInput
                allowFontScaling={false}
                key={key}
                keyboardType="decimal-pad"
                onChangeText={(value) => updateValue(key, value)}
                onFocus={onInputFocus}
                selectTextOnFocus
                style={key === 'kcal' ? styles.nutritionKcalInput : styles.nutritionMacroInput}
                value={values[key]}
              />
            ) : (
              <Text key={key} style={key === 'kcal' ? styles.totalKcalValue : styles.totalNutritionValue}>
                {food[key] ?? '-'}
              </Text>
            ),
          ]),
        )}
      />
    </View>
  );
}

function FoodDetailsEditor({
  food,
  macroRowRef,
  onChange,
  onNutritionEditingChange,
  onNutritionInputFocus,
  onRegisterApplyNutrition,
}: {
  food: RecordedFood;
  macroRowRef?: RefObject<View | null>;
  onChange: (food: RecordedFood) => void;
  onNutritionEditingChange?: (editing: boolean) => void;
  onNutritionInputFocus?: () => void;
  onRegisterApplyNutrition?: (apply: (() => RecordedFood | null) | null) => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(food.serving === 1 ? 1 : null);
  const [nutritionEditing, setNutritionEditing] = useState(false);
  const baseAmount = food.baseAmount ?? 300;

  const setAmount = (amount: number, preset: number | null = null) => {
    if (nutritionEditing) return;
    setSelectedPreset(preset);
    onChange(scaleFoodToAmount(food, amount));
  };
  const handleNutritionEditingChange = useCallback((editing: boolean) => {
    setNutritionEditing(editing);
    onNutritionEditingChange?.(editing);
  }, [onNutritionEditingChange]);

  return (
    <>
      <View style={[styles.detailsSection, nutritionEditing && styles.disabledSection]} pointerEvents={nutritionEditing ? 'none' : 'auto'}>
        <Text style={styles.sectionHeading}>섭취량</Text>
        <View style={styles.presetRow}>
          {editPresetRatios.map((ratio) => (
            <Pressable
              key={ratio}
              onPress={() => setAmount(Math.round(baseAmount * ratio), ratio)}
              style={[styles.presetButton, selectedPreset === ratio && styles.presetButtonSelected]}
            >
              <Text style={[styles.presetTitle, selectedPreset === ratio && styles.presetTitleSelected]}>
                {ratio}인분
              </Text>
              <Text style={[styles.presetMeta, selectedPreset === ratio && styles.presetMetaSelected]}>
                ({Math.round(baseAmount * ratio)}g)
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.amountStepper}>
          <Pressable accessibilityLabel="섭취량 10g 줄이기" onPress={() => setAmount(Math.max(0, food.amount - 10))} style={styles.stepButton}>
            <AmountStepIcon operation="decrease" />
          </Pressable>
          <Text style={styles.amountValue}>{food.amount > 0 ? `${food.amount}${food.unit}` : '-'}</Text>
          <Pressable accessibilityLabel="섭취량 10g 늘리기" onPress={() => setAmount(Math.min(999, food.amount + 10))} style={styles.stepButton}>
            <AmountStepIcon operation="increase" />
          </Pressable>
        </View>
      </View>
      <NutritionEditor
        food={food}
        macroRowRef={macroRowRef}
        onChange={onChange}
        onEditingChange={handleNutritionEditingChange}
        onInputFocus={onNutritionInputFocus}
        onRegisterApply={onRegisterApplyNutrition}
      />
    </>
  );
}

function RecognizedFoodList({
  foods,
  onAdd,
  onEdit,
}: {
  foods: RecordedFood[];
  onAdd: () => void;
  onEdit: (food: RecordedFood) => void;
}) {
  const indicator = useCustomScrollIndicator({
    enabled: foods.length > 3,
    showInitially: false,
  });
  return (
    <View style={styles.recognizedCard}>
      {foods.length ? (
        <View style={styles.recognizedListViewport}>
          <ScrollView
            nestedScrollEnabled
            onContentSizeChange={indicator.onContentSizeChange}
            onLayout={indicator.onLayout}
            onMomentumScrollBegin={indicator.onMomentumScrollBegin}
            onMomentumScrollEnd={indicator.onMomentumScrollEnd}
            onScroll={indicator.onScroll}
            onScrollBeginDrag={indicator.onScrollBeginDrag}
            onScrollEndDrag={indicator.onScrollEndDrag}
            scrollEnabled={foods.length > 3}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.recognizedListScroll}
          >
            <View style={styles.recognizedListContent}>
              {foods.map((food, index) => (
                <View key={food.id}>
                  {index > 0 ? <View style={styles.foodDivider} /> : null}
                  <View style={styles.foodRow}>
                    <View style={styles.foodIndex}><Text style={styles.foodIndexText}>{index + 1}</Text></View>
                    <View style={styles.foodCopy}>
                      <Text numberOfLines={1} style={styles.foodName}>{food.name}</Text>
                      <Text style={styles.foodAmount}>
                        {food.amount > 0 ? `${food.serving || '-'}인분 (${formatRecordedFoodAmount(food)})` : '정보 입력 필요'}
                      </Text>
                    </View>
                    <Text style={styles.foodKcal}>{food.kcal === undefined ? '-' : food.kcal} kcal</Text>
                    <Pressable accessibilityLabel={`${food.name} 수정`} onPress={() => onEdit(food)} style={styles.editFoodButton}>
                      <PencilIcon color={colors.textSecondary} fill={colors.textSecondary} height={14} width={14} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <CustomScrollIndicator {...indicator.indicatorProps} color={colors.primary} rightInset={1} topInset={0} bottomInset={0} />
        </View>
      ) : (
        <Text style={styles.noFoodText}>인식된 음식이 없어요.</Text>
      )}
      <Pressable onPress={onAdd} style={styles.addFoodButton}>
        <Text style={styles.addFoodButtonPlus}>+</Text>
        <Text style={styles.addFoodButtonText}>음식 추가하기</Text>
      </Pressable>
    </View>
  );
}

function ResultStep({
  draft,
  isSaving,
  onSave,
}: {
  draft: MealRecordDraft;
  isSaving: boolean;
  onSave: () => void;
}) {
  const result = mockAnalysisResults[MOCK_ANALYSIS_TYPE];
  const totalKcal = draft.foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0);
  const isRecognizedMock = draft.foods.length === 3 && draft.foods.every((food) => food.id.startsWith('recognized-'));
  const displayedKcal = isRecognizedMock ? 785 : Math.round(totalKcal);
  const mealName = draft.foods.length > 1
    ? `${draft.foods[0]?.name ?? '분석한 식사'} 세트`
    : draft.foods[0]?.name ?? '분석한 식사';
  const isGood = result.type === 'good';

  return (
    <View style={styles.resultContent}>
      <View style={styles.resultSummaryGroup}>
        <Text style={styles.screenTitle}>식단 분석 결과</Text>
        <View style={styles.resultMealCard}>
          {draft.photoUri ? <Image source={{ uri: draft.photoUri }} style={styles.resultImage} /> : null}
          <View style={styles.resultMealCopy}>
            <Text numberOfLines={1} style={styles.resultMealName}>{mealName}</Text>
            <Text numberOfLines={1} style={styles.resultMeta}>{draft.foods.length}가지 음식 · {displayedKcal} kcal</Text>
          </View>
        </View>
      </View>
      <View style={[styles.resultCard, isGood ? styles.goodCard : styles.cautionCard]}>
        {isGood ? (
          <View style={[styles.resultIcon, styles.goodIcon]}>
            <CheckCircleIcon color={colors.primaryDark} height={30} width={30} />
          </View>
        ) : (
          <WarningFillIcon color="#FFA450" height={50} width={50} />
        )}
        <View style={styles.resultMessageCopy}>
          <Text style={[styles.resultTitle, !isGood && styles.cautionText]}>{result.title}</Text>
          <Text style={styles.resultDescription}>{result.description}</Text>
        </View>
      </View>
      <View style={styles.resultRecommendationGroup}>
        <Text style={styles.resultActionsTitle}>{result.sectionTitle}</Text>
        <View style={styles.resultReasons}>
          {result.reasons.map((reason, index) => (
            <View key={reason}>
              {index > 0 ? <View style={styles.resultReasonDivider} /> : null}
              <View style={styles.reasonRow}>
                <View style={styles.reasonBadge}>
                  <Text style={styles.reasonBadgeText}>{index + 1}</Text>
                </View>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <PrimaryButton gradient disabled={isSaving} onPress={onSave}>
        <Text style={styles.primaryButtonText}>{isSaving ? '기록 중...' : '이 식단 기록하기'}</Text>
      </PrimaryButton>
    </View>
  );
}

export function MealRecordSheets({ visible, mealId, initialDraft, onClose, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [view, setView] = useState<SheetView>('photo');
  const [draft, setDraft] = useState<MealRecordDraft | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editFood, setEditFood] = useState<RecordedFood | null>(null);
  const [searchText, setSearchText] = useState('');
  const [replacementSelection, setReplacementSelection] = useState<FoodSelection | null>(null);
  const [addSelection, setAddSelection] = useState<FoodSelection | null>(null);
  const [addFoodDraft, setAddFoodDraft] = useState<RecordedFood | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNutritionEditing, setIsNutritionEditing] = useState(false);
  const [nutritionContentOffset] = useState(() => new Animated.Value(0));
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nutritionMacroRowRef = useRef<View>(null);
  const applyNutritionEditsRef = useRef<(() => RecordedFood | null) | null>(null);
  const keyboardTopRef = useRef<number | null>(null);
  const isNutritionEditingRef = useRef(false);
  const [foodShotViewportHeight] = useState(windowHeight);

  const animateNutritionOffset = useCallback((toValue: number) => {
    Animated.timing(nutritionContentOffset, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [nutritionContentOffset]);

  const moveNutritionAboveKeyboard = useCallback((keyboardTop: number) => {
    if (Platform.OS === 'web' || !isNutritionEditingRef.current || !nutritionMacroRowRef.current) return;

    nutritionMacroRowRef.current.measureInWindow((_x, y, _width, height) => {
      nutritionContentOffset.stopAnimation((currentOffset) => {
        const unshiftedRowBottom = y + height - currentOffset;
        const overlap = Math.max(0, unshiftedRowBottom + 12 - keyboardTop);
        animateNutritionOffset(-overlap);
      });
    });
  }, [animateNutritionOffset, nutritionContentOffset]);

  const handleNutritionInputFocus = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    if (keyboardTop === null) return;
    requestAnimationFrame(() => moveNutritionAboveKeyboard(keyboardTop));
  }, [moveNutritionAboveKeyboard]);

  const handleNutritionEditingChange = useCallback((editing: boolean) => {
    isNutritionEditingRef.current = editing;
    setIsNutritionEditing(editing);
    if (!editing) animateNutritionOffset(0);
  }, [animateNutritionOffset]);

  const registerNutritionEdits = useCallback((apply: (() => RecordedFood | null) | null) => {
    applyNutritionEditsRef.current = apply;
  }, []);

  const applyPendingNutritionEdits = useCallback((fallbackFood: RecordedFood) => {
    if (!isNutritionEditingRef.current) return fallbackFood;
    return applyNutritionEditsRef.current?.() ?? null;
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;

    const handleKeyboardShow = (event: { endCoordinates: { screenY: number } }) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      requestAnimationFrame(() => moveNutritionAboveKeyboard(event.endCoordinates.screenY));
    };
    const handleKeyboardHide = () => {
      keyboardTopRef.current = null;
      animateNutritionOffset(0);
    };
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      handleKeyboardShow,
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      handleKeyboardHide,
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [animateNutritionOffset, moveNutritionAboveKeyboard, visible]);

  useEffect(() => {
    if (isNutritionEditing && (view === 'edit' || view === 'add')) return;
    animateNutritionOffset(0);
  }, [animateNutritionOffset, isNutritionEditing, view]);

  useEffect(() => {
    if (!visible || !mealId) return;
    const frame = requestAnimationFrame(() => {
      const nextDraft = initialDraft ? cloneDraft(initialDraft) : createEmptyDraft(mealId);
      setDraft(nextDraft);
      setView(nextDraft.photoUri && nextDraft.foods.length ? 'review' : 'photo');
      setEditingFoodId(null);
      setEditFood(null);
      setSearchText('');
      setReplacementSelection(null);
      setAddSelection(null);
      setAddFoodDraft(null);
      setResultLoading(false);
      setIsSaving(false);
      setIsNutritionEditing(false);
      isNutritionEditingRef.current = false;
      applyNutritionEditsRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [initialDraft, mealId, visible]);

  useEffect(
    () => () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    },
    [],
  );

  const closeAll = () => {
    Keyboard.dismiss();
    isNutritionEditingRef.current = false;
    animateNutritionOffset(0);
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = null;
    setResultLoading(false);
    onClose();
  };

  const selectPhoto = async (source: 'camera' | 'gallery') => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          source === 'camera' ? '카메라 권한이 필요해요' : '사진 접근 권한이 필요해요',
          '설정에서 접근 권한을 허용한 뒤 다시 시도해 주세요.',
        );
        return;
      }
      const response =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.back, mediaTypes: ['images'], quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      const selected = response.canceled ? undefined : response.assets[0];
      if (selected) {
        const mimeType = selected.mimeType?.trim().toLowerCase() ?? null;
        if (selected.fileSize && selected.fileSize > 5 * 1024 * 1024) {
          Alert.alert('사진 용량이 너무 커요', '5MB 이하의 사진을 선택해 주세요.');
          return;
        }
        if (mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          Alert.alert(
            '지원하지 않는 사진 형식이에요',
            'JPEG, PNG, WebP 형식의 사진을 선택해 주세요.',
          );
          return;
        }
        setDraft((current) =>
          current
            ? {
                ...current,
                photoFileName: selected.fileName ?? null,
                photoFileSize: selected.fileSize ?? null,
                photoMimeType: mimeType,
                photoUri: selected.uri,
              }
            : current,
        );
      }
    } catch (error) {
      console.error('푸드샷 이미지 선택 실패:', error);
      Alert.alert('사진을 불러오지 못했어요', '잠시 후 다시 시도해 주세요.');
    }
  };

  const finishImageAnalysis = () => {
    setDraft((current) =>
      current
        ? { ...current, foods: current.foods.length ? current.foods : createRecognizedFoods() }
        : current,
    );
    setView('review');
  };

  const openFoodEdit = (food: RecordedFood) => {
    setEditingFoodId(food.id);
    setEditFood({ ...food });
    setReplacementSelection(null);
    applyNutritionEditsRef.current = null;
    setSearchText('');
    setView('edit');
  };

  const saveEditedFood = () => {
    if (!editingFoodId || !editFood) return;
    const foodToSave = applyPendingNutritionEdits(editFood);
    if (!foodToSave) return;
    Keyboard.dismiss();
    setDraft((current) =>
      current
        ? { ...current, foods: current.foods.map((food) => (food.id === editingFoodId ? { ...foodToSave } : food)) }
        : current,
    );
    setView('review');
  };

  const deleteEditedFood = () => {
    if (!editingFoodId) return;
    setDraft((current) =>
      current ? { ...current, foods: current.foods.filter((food) => food.id !== editingFoodId) } : current,
    );
    setView('review');
  };

  const openReplace = () => {
    setSearchText('');
    setReplacementSelection(null);
    setView('replace');
  };

  const selectReplacement = (selection: FoodSelection) => {
    if (!editFood) return;
    const nextFood =
      selection.kind === 'database'
        ? databaseFoodToRecorded(selection.food, editFood.id)
        : createCustomFood(selection.name, editFood.id);

    setReplacementSelection(selection);
    setEditFood(nextFood);
    setSearchText('');
  };

  const applyReplacement = () => {
    if (!replacementSelection || !editFood) return;
    setView('edit');
  };

  const openAdd = () => {
    setSearchText('');
    setAddSelection(null);
    setAddFoodDraft(createEmptyFoodDraft());
    applyNutritionEditsRef.current = null;
    setView('add');
  };

  const chooseAddFood = (selection: FoodSelection) => {
    setAddSelection(selection);
    setAddFoodDraft(
      selection.kind === 'database'
        ? databaseFoodToRecorded(selection.food)
        : createCustomFood(selection.name),
    );
  };

  const addFood = () => {
    if (!addFoodDraft || addFoodDraft.amount <= 0) return;
    const foodToAdd = applyPendingNutritionEdits(addFoodDraft);
    if (!foodToAdd) return;
    Keyboard.dismiss();
    setDraft((current) => (current ? { ...current, foods: [...current.foods, { ...foodToAdd }] } : current));
    setView('review');
  };

  const showAnalysisResult = () => {
    if (resultLoading) return;
    setResultLoading(true);
    resultTimerRef.current = setTimeout(() => {
      setResultLoading(false);
      setView('result');
      resultTimerRef.current = null;
    }, RESULT_LOADING_MS);
  };

  const handleSaveFoodShotMeal = async () => {
    if (!draft || isSaving) return;
    setIsSaving(true);
    const analysis = analyzeRecordedMealMock(draft.foods);
    try {
      await onComplete(cloneDraft({ ...draft, ...analysis }));
    } finally {
      setIsSaving(false);
    }
  };

  const mainStep = view === 'photo' ? 1 : view === 'analysis' ? 2 : view === 'result' ? 4 : 3;
  const isSubSheet = view === 'edit' || view === 'replace' || view === 'add';
  const subSheetTitle = view === 'edit' ? '음식 수정하기' : view === 'replace' ? '음식 변경' : '음식 추가하기';
  const onBack =
    view === 'result'
      ? () => setView('review')
      : view === 'edit' || view === 'add'
        ? () => setView('review')
        : view === 'replace'
          ? () => setView('edit')
          : undefined;
  const minimumTopGap = Math.max(22, insets.top + 4);
  const desiredHeight = isSubSheet ? SUB_SHEET_HEIGHT : STEP_SHEET_HEIGHT;
  const sheetHeight = Math.min(desiredHeight, foodShotViewportHeight - minimumTopGap);
  const isCompactSheet = sheetHeight < desiredHeight;

  const renderPhoto = () => (
    <View style={styles.photoContent}>
      <Text maxFontSizeMultiplier={1} style={[styles.screenTitle, styles.photoScreenTitle]}>음식 사진 등록하기</Text>
      <View style={styles.photoFrame}>
        <View style={styles.photoBox}>
          {draft?.photoUri ? (
            <Image resizeMode="cover" source={{ uri: draft.photoUri }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.emptyPhoto}>
              <View style={styles.cameraCircle}>
                <CameraIcon color={colors.primary} fill={colors.primary} height={36} width={36} />
              </View>
              <Text maxFontSizeMultiplier={1} style={styles.emptyPhotoText}>등록된 사진이 없어요</Text>
            </View>
          )}
        </View>
        <View style={styles.photoTip}>
          <LightbulbIcon color={colors.primary} fill={colors.primary} height={16} width={16} />
          <Text maxFontSizeMultiplier={1} style={styles.photoTipText}><Text style={styles.photoTipLabel}>TIP </Text>밝은 곳에서 음식이 잘 보이도록 찍는게 좋아요!</Text>
        </View>
        <View style={styles.photoActions}>
          <OutlineAction icon={<CameraIcon color={colors.primary} fill={colors.primary} height={24} width={24} />} label="사진 촬영하기" onPress={() => void selectPhoto('camera')} />
          <OutlineAction icon={<GalleryIcon color={colors.primary} fill={colors.primary} height={24} width={24} />} label="갤러리에서 선택하기" onPress={() => void selectPhoto('gallery')} />
          {draft?.photoUri ? (
            <PrimaryButton gradient onPress={() => setView('analysis')}>
              <View style={styles.analyzeButtonContent}>
                <Text maxFontSizeMultiplier={1} style={styles.primaryButtonText}>분석하기</Text>
                <View style={styles.ctaArrowCircle}><ArrowRightIcon color={colors.primary} height={16} width={16} /></View>
              </View>
            </PrimaryButton>
          ) : null}
        </View>
      </View>
    </View>
  );

  const aggregateFood = useMemo<RecordedFood>(() => ({
    id: 'total',
    name: '합계',
    amount: 0,
    serving: 0,
    unit: 'g',
    kcal: draft?.foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0),
    carbs: draft?.foods.reduce((sum, food) => sum + (food.carbs ?? 0), 0),
    protein: draft?.foods.reduce((sum, food) => sum + (food.protein ?? 0), 0),
    fat: draft?.foods.reduce((sum, food) => sum + (food.fat ?? 0), 0),
  }), [draft?.foods]);

  const renderReview = () => (
    <View style={styles.reviewContent}>
      <View style={styles.reviewFoodGroup}>
        <Text style={styles.screenTitle}>인식된 음식 수정</Text>
        <RecognizedFoodList foods={draft?.foods ?? []} onAdd={openAdd} onEdit={openFoodEdit} />
      </View>
      <View style={styles.totalNutritionSection}>
        <Text style={styles.screenTitle}>영양 정보</Text>
        <NutritionPanel food={aggregateFood} />
      </View>
      <View style={styles.reviewCta}>
        <PrimaryButton gradient disabled={resultLoading || !draft?.foods.length} onPress={showAnalysisResult}>
          {resultLoading ? (
            <View style={styles.resultLoadingContent}><Text style={styles.primaryButtonText}>분석 중</Text><LoadingDots /></View>
          ) : (
            <View style={styles.analyzeButtonContent}>
              <Text style={styles.primaryButtonText}>분석 결과 보기</Text>
              <View style={styles.ctaArrowCircle}><ArrowRightIcon color={colors.primary} height={16} width={16} /></View>
            </View>
          )}
        </PrimaryButton>
      </View>
    </View>
  );

  const renderEdit = () => {
    if (!editFood) return null;
    return (
      <View style={styles.editorContent}>
        <View style={styles.editFoodSection}>
          <Text style={styles.sectionHeading}>음식</Text>
          <View style={styles.selectedFoodCard}>
            <View style={styles.selectedFoodCopy}>
              <View style={styles.selectedFoodInfoRow}>
                <Text style={styles.selectedFoodName}>{editFood.name}</Text>
                {!editFood.isCustom && editFood.amount > 0 ? (
                  <Text style={styles.selectedFoodMeta}>추천량 1인분</Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={openReplace} style={styles.changeFoodButton}>
              <Text style={styles.changeFoodText}>음식 변경</Text>
              <ChevronRightIcon color={colors.primary} height={20} width={20} />
            </Pressable>
          </View>
        </View>
        <View style={styles.editFoodDetails}>
          <FoodDetailsEditor
            food={editFood}
            macroRowRef={nutritionMacroRowRef}
            onChange={setEditFood}
            onNutritionEditingChange={handleNutritionEditingChange}
            onNutritionInputFocus={handleNutritionInputFocus}
            onRegisterApplyNutrition={registerNutritionEdits}
          />
        </View>
        <View style={styles.editorActions}>
          <PrimaryButton onPress={saveEditedFood}>수정 완료</PrimaryButton>
          <Pressable onPress={deleteEditedFood} style={styles.deleteFoodButton}>
            <TrashIcon color="#E45B5B" height={28} width={28} />
            <Text style={styles.deleteFoodText}>이 음식 삭제하기</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderReplace = () => {
    const currentFoodName = editFood?.name;
    const currentFoodMeta = editFood?.isCustom || !editFood
      ? null
      : `1인분 · 약 ${editFood.kcal ?? '-'} kcal`;

    return (
    <View style={styles.replaceContent}>
      <FoodSearch
        onSelect={selectReplacement}
        onSearchStart={() => setReplacementSelection(null)}
        searchText={searchText}
        selectionMade={Boolean(replacementSelection)}
        setSearchText={(value) => { setSearchText(value); setReplacementSelection(null); }}
      />
      <View style={styles.currentFoodBox}>
        <Text style={styles.currentFoodLabel}>현재 인식된 음식</Text>
        <View style={styles.currentFoodInfoRow}>
          <Text style={styles.currentFoodName}>{currentFoodName}</Text>
          {currentFoodMeta ? <Text style={styles.currentFoodMeta}>{currentFoodMeta}</Text> : null}
        </View>
      </View>
      <View style={styles.recommendationHeading}>
        <Text style={styles.sectionHeading}>추천 음식</Text>
        <Text style={styles.recommendationSubtitle}>사진과 비슷한 음식이에요.</Text>
      </View>
      <FoodRecommendationList onSelect={selectReplacement} selected={replacementSelection} />
      <View style={styles.bottomCta}><PrimaryButton disabled={!replacementSelection} onPress={applyReplacement}>이 음식으로 변경</PrimaryButton></View>
    </View>
    );
  };

  const renderAdd = () => (
    <View style={styles.addContent}>
      <View style={styles.addFoodSelection}>
        {addSelection && addFoodDraft ? (
          <Pressable onPress={() => { setAddSelection(null); setAddFoodDraft(createEmptyFoodDraft()); setSearchText(''); }} style={styles.selectedFoodCard}>
            <View style={styles.selectedFoodCopy}>
              <Text style={styles.selectedFoodName}>{addFoodDraft.name}</Text>
              {!addFoodDraft.isCustom ? (
                <Text style={styles.selectedFoodMeta}>1인분 ({addFoodDraft.baseAmount ?? addFoodDraft.amount}{addFoodDraft.unit}) · 약 {addFoodDraft.kcal ?? '-'} kcal</Text>
              ) : null}
            </View>
            <SearchIcon color={colors.primary} height={20} width={20} />
          </Pressable>
        ) : (
          <FoodSearch
            onSearchStart={() => { setAddSelection(null); setAddFoodDraft(createEmptyFoodDraft()); }}
            onSelect={(selection) => { chooseAddFood(selection); setSearchText(''); }}
            searchText={searchText}
            setSearchText={setSearchText}
          />
        )}
      </View>
      {addFoodDraft ? (
        <View style={styles.addFoodDetails}>
          <FoodDetailsEditor
            food={addFoodDraft}
            macroRowRef={nutritionMacroRowRef}
            onChange={setAddFoodDraft}
            onNutritionEditingChange={handleNutritionEditingChange}
            onNutritionInputFocus={handleNutritionInputFocus}
            onRegisterApplyNutrition={registerNutritionEdits}
          />
        </View>
      ) : null}
      <View style={styles.bottomCta}><PrimaryButton disabled={!addSelection || !addFoodDraft || addFoodDraft.amount <= 0} onPress={addFood}>추가하기</PrimaryButton></View>
    </View>
  );

  if (!draft) return null;

  const mainStepContent = (
    <>
      {view === 'photo' ? renderPhoto() : null}
      {view === 'analysis' && draft.photoUri ? <FoodAnalysisStep imageUri={draft.photoUri} onComplete={finishImageAnalysis} /> : null}
      {view === 'review' ? renderReview() : null}
      {view === 'result' ? <ResultStep draft={draft} isSaving={isSaving} onSave={() => void handleSaveFoodShotMeal()} /> : null}
    </>
  );

  return (
    <AppBottomSheet
      animationDistance={820}
      contentStyle={styles.bottomSheetContent}
      keyboardShouldPersistTaps="handled"
      lockBackgroundScroll
      minimumTopGap={minimumTopGap}
      onClose={closeAll}
      overlayStyle={styles.overlay}
      preserveViewportHeightWhileVisible
      scrollable={false}
      separateAnimations
      sheetStyle={[styles.sheet, { height: sheetHeight }]}
      showHandle={false}
      visible={visible}
    >
      {isSubSheet && onBack ? (
        <FoodShotSubSheetHeader onBack={onBack} onClose={closeAll} title={subSheetTitle} />
      ) : (
        <FoodShotStepHeader currentStep={mainStep} onBack={onBack} onClose={closeAll} />
      )}
      <Animated.View
        style={[
          styles.flowBody,
          isSubSheet ? styles.subSheetBody : styles.stepSheetBody,
          isCompactSheet && styles.compactSheetBody,
          { transform: [{ translateY: nutritionContentOffset }] },
        ]}
      >
        {isSubSheet && isCompactSheet ? (
          <ScrollView
            contentContainerStyle={styles.subSheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.innerSheetScroll}
          >
            {view === 'edit' ? renderEdit() : null}
            {view === 'replace' ? renderReplace() : null}
            {view === 'add' ? renderAdd() : null}
          </ScrollView>
        ) : isSubSheet ? (
          <>
            {view === 'edit' ? renderEdit() : null}
            {view === 'replace' ? renderReplace() : null}
            {view === 'add' ? renderAdd() : null}
          </>
        ) : isCompactSheet ? (
          <ScrollView
            contentContainerStyle={styles.compactStepScrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.innerSheetScroll}
          >
            {mainStepContent}
          </ScrollView>
        ) : mainStepContent}
      </Animated.View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, boxSizing: 'border-box', overflow: 'hidden', paddingTop: 5 },
  bottomSheetContent: { flex: 1, minHeight: 0, paddingHorizontal: 21, paddingTop: 0 },
  chrome: { alignItems: 'center', height: 46, justifyContent: 'flex-start', position: 'relative' },
  subSheetChrome: { alignItems: 'center', height: 55, justifyContent: 'flex-start', position: 'relative' },
  dragHandle: { backgroundColor: '#D9D9D9', borderRadius: 2, height: 4, marginTop: 6, width: 40 },
  stepRow: { alignItems: 'center', flexDirection: 'row', marginTop: 16 },
  stepSegment: { alignItems: 'center', flexDirection: 'row' },
  stepLine: { backgroundColor: colors.border, height: 1, width: 38 },
  stepLineActive: { backgroundColor: colors.primary },
  stepCircle: { alignItems: 'center', borderColor: colors.textDisabled, borderRadius: 9, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 },
  stepCircleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepCircleComplete: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  stepText: { color: colors.textDisabled, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 9 },
  stepTextActive: { color: colors.surface },
  stepTextComplete: { color: colors.primaryDark },
  backButton: { alignItems: 'center', height: foodShotHeaderControlSize, justifyContent: 'center', left: 0, position: 'absolute', top: 20, width: foodShotHeaderControlSize },
  closeButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: foodShotHeaderControlSize / 2, borderWidth: 1, elevation: 2, height: foodShotHeaderControlSize, justifyContent: 'center', position: 'absolute', right: 0, shadowColor: colors.primaryDark, shadowOffset: { height: 2, width: 2 }, shadowOpacity: 0.2, shadowRadius: 2.5, top: 20, width: foodShotHeaderControlSize },
  subSheetTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 24, left: 30, lineHeight: 29, position: 'absolute', right: 30, textAlign: 'center', top: 26 },
  subSheetBackButton: { alignItems: 'center', height: foodShotHeaderControlSize, justifyContent: 'center', left: 0, position: 'absolute', top: 26, width: foodShotHeaderControlSize },
  subSheetCloseButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: foodShotHeaderControlSize / 2, borderWidth: 1, elevation: 2, height: foodShotHeaderControlSize, justifyContent: 'center', position: 'absolute', right: 0, shadowColor: colors.primaryDark, shadowOffset: { height: 2, width: 2 }, shadowOpacity: 0.2, shadowRadius: 2.5, top: 26, width: foodShotHeaderControlSize },
  flowBody: { minHeight: 0 },
  stepSheetBody: { height: STEP_SHEET_BODY_HEIGHT, marginTop: 39 },
  subSheetBody: { height: SUB_SHEET_BODY_HEIGHT, marginTop: 30 },
  compactSheetBody: { flex: 1, height: undefined },
  innerSheetScroll: { flex: 1 },
  subSheetScrollContent: { flexGrow: 1 },
  compactStepScrollContent: { flexGrow: 1, minHeight: STEP_SHEET_BODY_HEIGHT },
  screenTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 24, lineHeight: 29, textAlign: 'center' },
  photoScreenTitle: { lineHeight: 29 },
  photoContent: { flex: 1, gap: 20 },
  photoFrame: { flex: 1, minHeight: 0 },
  photoBox: { backgroundColor: '#F4FAF9', borderColor: '#71C7B9', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, height: 180, overflow: 'hidden' },
  emptyPhoto: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center' },
  cameraCircle: { alignItems: 'center', backgroundColor: '#D0F0E9', borderRadius: 33, height: 65, justifyContent: 'center', width: 65 },
  emptyPhotoText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 18 },
  photoTip: { alignItems: 'center', backgroundColor: '#F4FAF9', borderRadius: 10, flexDirection: 'row', gap: 5, height: 38, justifyContent: 'center', marginTop: 20, paddingHorizontal: 12 },
  photoTipText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  photoTipLabel: { color: colors.primary, fontFamily: fontFamilies.pretendardBold },
  photoActions: { gap: 10, marginTop: 'auto' },
  outlineAction: { alignItems: 'center', borderColor: colors.primary, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, height: 48, justifyContent: 'center' },
  outlineActionText: { color: colors.primary, fontFamily: fontFamilies.pretendardBold, fontSize: 20 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, height: 48, justifyContent: 'center', width: '100%' },
  gradientButton: { backgroundColor: 'transparent', elevation: 3, overflow: 'hidden', shadowColor: colors.primary, shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.25, shadowRadius: 6 },
  primaryButtonDisabled: { backgroundColor: '#C8DED9' },
  primaryButtonText: { color: colors.surface, fontFamily: fontFamilies.pretendardBold, fontSize: 20 },
  analyzeButtonContent: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', position: 'relative', width: '100%' },
  ctaArrowCircle: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, height: 24, justifyContent: 'center', position: 'absolute', right: 9, width: 24 },
  pressed: { opacity: 0.72 },
  analysisContent: { alignItems: 'center', flex: 1 },
  analysisVisual: { height: 225, marginTop: 11, position: 'relative', width: 225 },
  analysisImage: { borderRadius: 100, height: 190, left: 17.5, position: 'absolute', top: 17.5, width: 190 },
  analysisProgress: { left: 0, position: 'absolute', top: 0 },
  analysisPercentage: { color: colors.primary, lineHeight: 44, marginTop: 0 },
  analysisPercentageNumber: { fontFamily: fontFamilies.pretendardBold, fontSize: 40 },
  analysisPercentageUnit: { fontFamily: fontFamilies.pretendardBold, fontSize: 30 },
  analysisStages: { backgroundColor: colors.surface, borderRadius: 10, elevation: 2, gap: 8, height: 100, justifyContent: 'center', marginTop: 10, paddingHorizontal: 14, shadowColor: '#000', shadowOffset: { height: 0, width: 0 }, shadowOpacity: 0.14, shadowRadius: 3, width: 240 },
  analysisStageRow: { alignItems: 'center', flexDirection: 'row', gap: 9, height: 22 },
  analysisStageText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  analysisStageTextActive: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardSemiBold },
  analysisStageTextPending: { color: colors.textDisabled },
  processingDots: { height: 21, position: 'relative', width: 21 },
  processingDot: { backgroundColor: colors.primary, borderRadius: 2, height: 3, position: 'absolute', width: 3 },
  waitNotice: { alignItems: 'center', backgroundColor: '#F4FAF9', borderRadius: 10, flexDirection: 'row', gap: 6, height: 38, justifyContent: 'center', marginTop: 12, width: '100%' },
  waitNoticeText: { color: colors.primary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  reviewContent: { flex: 1, justifyContent: 'space-between' },
  reviewFoodGroup: { gap: 10 },
  reviewCta: {},
  recognizedCard: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 220, padding: 15 },
  recognizedListViewport: { height: recognizedListViewportHeight, position: 'relative' },
  recognizedListScroll: { height: '100%' },
  recognizedListContent: { paddingRight: 7 },
  foodRow: { alignItems: 'center', flexDirection: 'row', gap: 9, height: 38 },
  foodIndex: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: 5, height: 30, justifyContent: 'center', width: 30 },
  foodIndexText: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 15 },
  foodCopy: { flex: 1, gap: 2 },
  foodName: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  foodAmount: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  foodKcal: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  editFoodButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 5, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  foodDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: 6 },
  addFoodButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 3, height: 38, justifyContent: 'center', marginTop: 10 },
  addFoodButtonPlus: { color: colors.primary, fontFamily: fontFamilies.pretendardRegular, fontSize: 25, lineHeight: 25 },
  addFoodButtonText: { color: colors.primary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  noFoodText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, padding: 24, textAlign: 'center' },
  totalNutritionSection: {},
  totalKcalBox: { alignItems: 'center', backgroundColor: '#F4FAF9', borderRadius: 10, flexDirection: 'row', gap: 10, height: 40, justifyContent: 'center', marginTop: 10 },
  totalKcalValue: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 24 },
  totalKcalUnit: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 18 },
  totalNutritionGrid: { alignItems: 'center', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', height: 70, marginTop: 5 },
  totalNutritionItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 15, justifyContent: 'center' },
  nutritionTextColumn: { alignItems: 'flex-start', gap: 3 },
  totalNutritionLabel: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  totalNutritionValue: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20 },
  totalNutritionUnit: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20 },
  nutritionDivider: { backgroundColor: colors.border, height: 35, width: 1 },
  resultLoadingContent: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  loadingDots: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 18 },
  loadingDot: { backgroundColor: colors.surface, borderRadius: 4, height: 7, width: 7 },
  editorContent: { flex: 1 },
  editFoodSection: { gap: 8 },
  editFoodDetails: { gap: 30, marginTop: 30 },
  addContent: { flex: 1, paddingTop: 6 },
  addFoodSelection: { width: '100%' },
  addFoodDetails: { gap: 32, marginTop: 36 },
  selectedFoodCard: { alignItems: 'center', backgroundColor: '#F7F7F7', borderRadius: 10, flexDirection: 'row', minHeight: 70, padding: 12 },
  selectedFoodCopy: { flex: 1 },
  selectedFoodInfoRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  selectedFoodName: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20 },
  selectedFoodMeta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  changeFoodButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 2, height: 38, justifyContent: 'center', paddingLeft: 10, paddingRight: 5 },
  changeFoodText: { color: colors.primary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  detailsSection: { gap: 8 },
  disabledSection: { opacity: 0.38 },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionHeading: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 27 },
  presetRow: { flexDirection: 'row', gap: 6 },
  presetButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 7, borderWidth: 1, flex: 1, gap: 3, height: 55, justifyContent: 'center' },
  presetButtonSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  presetTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  presetTitleSelected: { color: colors.primaryDark },
  presetMeta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  presetMetaSelected: { color: colors.primary },
  amountStepper: { alignItems: 'center', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', height: 58, justifyContent: 'space-between', paddingHorizontal: 16 },
  stepButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  amountValue: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 22 },
  nutritionSection: { gap: 0 },
  editNutritionButton: { alignItems: 'center', backgroundColor: '#E5F0FF', borderRadius: 20, flexDirection: 'row', gap: 3, minHeight: 25, paddingBottom: 4, paddingLeft: 10, paddingRight: 13, paddingTop: 4 },
  confirmNutritionButton: { backgroundColor: colors.primaryLight },
  editNutritionText: { color: '#3E7DDD', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
  confirmNutritionText: { color: colors.primaryDark },
  nutritionValueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 3, justifyContent: 'flex-start' },
  nutritionKcalInput: { backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: 10, borderWidth: 1, color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 18, height: 32, padding: 0, textAlign: 'center', width: 90 },
  nutritionMacroInput: { backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: 8, borderWidth: 1, color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20, height: 28, padding: 0, textAlign: 'center', width: 45 },
  editorActions: { gap: 10, marginTop: 'auto' },
  deleteFoodButton: { alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: 12, flexDirection: 'row', gap: 8, height: 48, justifyContent: 'center', width: '100%' },
  deleteFoodText: { color: '#E45B5B', fontFamily: fontFamilies.pretendardBold, fontSize: 20 },
  replaceContent: { flex: 1, gap: 12 },
  searchArea: { position: 'relative', zIndex: 20 },
  searchField: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, height: 48, paddingHorizontal: 12 },
  searchInput: { color: colors.textBody, flex: 1, fontFamily: fontFamilies.pretendardMedium, fontSize: 18, padding: 0 },
  autocompleteOverlay: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderWidth: 1, elevation: 10, left: 0, maxHeight: 220, overflow: 'hidden', position: 'absolute', right: 0, shadowColor: '#000', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.14, shadowRadius: 8, top: 47, zIndex: 30 },
  autocompleteListWrap: { maxHeight: 218, position: 'relative' },
  searchResultRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 44, justifyContent: 'space-between', paddingHorizontal: 12 },
  searchResultName: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  searchMatch: { fontFamily: fontFamilies.pretendardBold },
  searchResultKcal: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  emptySearch: { alignItems: 'center', gap: 8, padding: 14 },
  emptySearchText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  customFoodButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 8, borderWidth: 1, height: 38, justifyContent: 'center', width: '100%' },
  customFoodButtonText: { color: colors.primary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  currentFoodBox: { backgroundColor: '#F4FAF9', borderRadius: 10, gap: 8, minHeight: 70, padding: 12 },
  currentFoodLabel: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  currentFoodInfoRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  currentFoodName: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20 },
  currentFoodMeta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  recommendationHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  recommendationSubtitle: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 17 },
  recommendationListWrap: { flex: 1, minHeight: 0, position: 'relative' },
  recommendationListContent: { gap: 8, width: '100%' },
  recommendationCard: { alignItems: 'center', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, height: 60, paddingHorizontal: 12, width: '100%' },
  recommendationBadge: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: 8, height: 30, justifyContent: 'center', width: 30 },
  recommendationBadgeText: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 15 },
  recommendationCopy: { flex: 1, gap: 1 },
  recommendationName: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  recommendationMeta: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
  radio: { alignItems: 'center', borderColor: colors.textDisabled, borderRadius: 11, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { backgroundColor: colors.primary, borderRadius: 7, height: 14, width: 14 },
  customSelection: { backgroundColor: colors.primaryLight, borderRadius: 8, gap: 2, padding: 10 },
  customSelectionLabel: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 11 },
  customSelectionName: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
  bottomCta: { marginTop: 'auto' },
  resultContent: { flex: 1, justifyContent: 'space-between' },
  resultSummaryGroup: { gap: 10, width: '100%' },
  resultRecommendationGroup: { alignItems: 'center', gap: 10, width: '100%' },
  resultMealCard: { alignItems: 'center', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', height: 100, padding: 8 },
  resultImage: { borderRadius: 8, height: 82, width: 100 },
  resultMealCopy: { flex: 1, gap: 4, minWidth: 0, paddingLeft: 10 },
  resultMealName: { color: colors.textBody, flexShrink: 1, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 18 },
  resultMeta: { color: colors.textSecondary, flexShrink: 1, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  resultCard: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 10, minHeight: 100, padding: 10, width: '100%' },
  goodCard: { backgroundColor: '#EFFAF7' },
  cautionCard: { backgroundColor: '#FFF9F4' },
  resultIcon: { alignItems: 'center', borderRadius: 25, height: 50, justifyContent: 'center', width: 50 },
  goodIcon: { backgroundColor: '#DDF5EF' },
  resultMessageCopy: { flex: 1, gap: 10 },
  resultTitle: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20 },
  cautionText: { color: '#FFA450' },
  resultDescription: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 16, lineHeight: 21 },
  resultActionsTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 24, lineHeight: 29 },
  resultReasons: { paddingHorizontal: 0, width: '100%' },
  resultReasonDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: 7 },
  reasonRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 26, width: '100%' },
  reasonBadge: { alignItems: 'center', backgroundColor: '#DDF5EF', borderRadius: 5, height: 26, justifyContent: 'center', width: 26 },
  reasonBadgeText: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardBold, fontSize: 14 },
  reasonText: { color: colors.textBody, flex: 1, flexShrink: 1, fontFamily: fontFamilies.pretendardMedium, fontSize: 13, lineHeight: 18, minWidth: 0 },
});
