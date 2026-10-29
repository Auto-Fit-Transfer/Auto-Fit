import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Image, Keyboard, Modal, Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { SvgProps } from 'react-native-svg';

import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import HouseIcon from '@/assets/icons/ui/house.svg';
import ImageIcon from '@/assets/icons/ui/image.svg';
import SearchIcon from '@/assets/icons/ui/magnifying-glass.svg';
import PencilIcon from '@/assets/icons/ui/pencil-simple.svg';
import {
  AppButton,
  AppDialog,
  AppTextField,
  Chip,
  IconButton,
  noWebFocusRing,
  ProgressBar,
  Text,
} from '@/src/components/common';
import { SubScreen } from '@/src/components/navigation';
import { useTemporaryAdjustmentProgress } from '@/src/features/exercise/useTemporaryAdjustmentProgress';
import { radius, scaleForEasyMode, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { analyzeRecordedMealMock } from '@/src/utils/diet/analyzeRecordedMealMock';

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
type FlowView = 'photo' | 'analysis' | 'review' | 'edit' | 'add';

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
  { kind: 'database'; food: FoodDatabaseItem } | { kind: 'custom'; name: string };

type Props = {
  visible: boolean;
  mealId: string | null;
  initialDraft?: MealRecordDraft;
  onClose: () => void;
  onComplete: (draft: MealRecordDraft) => Promise<boolean>;
};

const mealLabels: Record<string, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
};
const servingPresets = [0.5, 1, 1.5, 2] as const;
const nutrientFields: { key: NutrientKey; label: string; unit: string }[] = [
  { key: 'kcal', label: '칼로리', unit: 'kcal' },
  { key: 'carbs', label: '탄수화물', unit: 'g' },
  { key: 'protein', label: '단백질', unit: 'g' },
  { key: 'fat', label: '지방', unit: 'g' },
];

// TEMP: food recognition is not connected yet, so the photo always "finds" the same foods and
// the search uses this short local list, as before the redesign.
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

const databaseFoodToRecorded = (
  food: FoodDatabaseItem,
  id = `food-${Date.now()}`,
): RecordedFood => ({
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

// Ids for foods added by hand; the time of loading keeps them apart from earlier records.
const sessionStamp = Date.now();
let addedFoodCount = 0;
const newFoodId = () => `added-${sessionStamp}-${(addedFoodCount += 1)}`;

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

const round = (value?: number) => (value === undefined ? undefined : Math.round(value));

// "1인분(300g) · 480kcal", or "200g · 200kcal" for a food typed by hand.
function foodSummary(food: RecordedFood) {
  if (food.amount <= 0) return '먹은 양을 적어 주세요';
  const amount = formatRecordedFoodAmount(food);
  const portion = !food.isCustom && food.serving > 0 ? `${food.serving}인분(${amount})` : amount;
  return food.kcal === undefined ? portion : `${portion} · ${round(food.kcal)}kcal`;
}

function nutritionLine(food: Pick<RecordedFood, NutrientKey>) {
  if ([food.kcal, food.carbs, food.protein, food.fat].every((value) => value === undefined)) {
    return '영양 정보가 없어요. 아는 만큼 적어 주세요.';
  }
  const show = (value: number | undefined, unit: string) =>
    value === undefined ? '-' : `${round(value)}${unit}`;
  const kcal = food.kcal === undefined ? '칼로리 -' : show(food.kcal, 'kcal');
  return `${kcal} · 탄수화물 ${show(food.carbs, 'g')} · 단백질 ${show(
    food.protein,
    'g',
  )} · 지방 ${show(food.fat, 'g')}`;
}

// Figma D2 (사진 기록) and D3 (음식 고치기) as a full-screen flow over the diet tab.
// The name stays for the diet screen that opens it.
export function MealRecordSheets({ visible, mealId, initialDraft, onClose, onComplete }: Props) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [view, setView] = useState<FlowView>('photo');
  const [draft, setDraft] = useState<MealRecordDraft | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<'close' | 'home' | null>(null);
  const mealLabel = mealLabels[mealId ?? ''] ?? '식사';

  useEffect(() => {
    if (!visible || !mealId) return;
    const frame = requestAnimationFrame(() => {
      const nextDraft = initialDraft ? cloneDraft(initialDraft) : createEmptyDraft(mealId);
      setDraft(nextDraft);
      setView(nextDraft.photoUri && nextDraft.foods.length ? 'review' : 'photo');
      setEditingFoodId(null);
      setIsSaving(false);
      setLeaveTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialDraft, mealId, visible]);

  const closeAll = () => {
    Keyboard.dismiss();
    setLeaveTarget(null);
    onClose();
  };

  // Leaving after foods were found asks once, so the list is not lost by a stray tap.
  const requestLeave = (target: 'close' | 'home') => {
    if (draft?.foods.length) {
      setLeaveTarget(target);
      return;
    }
    closeAll();
    if (target === 'home') router.navigate('/home');
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
          ? await ImagePicker.launchCameraAsync({
              cameraType: ImagePicker.CameraType.back,
              mediaTypes: ['images'],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      const selected = response.canceled ? undefined : response.assets[0];
      if (selected) {
        const mimeType = selected.mimeType?.trim().toLowerCase() ?? null;
        if (selected.fileSize && selected.fileSize > 5 * 1024 * 1024) {
          Alert.alert('사진 용량이 너무 커요', '5MB 이하의 사진을 골라 주세요.');
          return;
        }
        if (mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          Alert.alert('지원하지 않는 사진 형식이에요', 'JPEG, PNG, WebP 사진을 골라 주세요.');
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

  const saveFood = (food: RecordedFood) => {
    setDraft((current) => {
      if (!current) return current;
      const exists = current.foods.some((item) => item.id === food.id);
      return {
        ...current,
        foods: exists
          ? current.foods.map((item) => (item.id === food.id ? { ...food } : item))
          : [...current.foods, { ...food }],
      };
    });
    setView('review');
  };

  const deleteFood = (foodId: string) => {
    setDraft((current) =>
      current ? { ...current, foods: current.foods.filter((food) => food.id !== foodId) } : current,
    );
    setView('review');
  };

  const handleSave = async () => {
    if (!draft || isSaving) return;
    setIsSaving(true);
    const analysis = analyzeRecordedMealMock(draft.foods);
    try {
      await onComplete(cloneDraft({ ...draft, ...analysis }));
    } finally {
      setIsSaving(false);
    }
  };

  const totals = useMemo(
    () => ({
      kcal: draft?.foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0) ?? 0,
      carbs: draft?.foods.reduce((sum, food) => sum + (food.carbs ?? 0), 0) ?? 0,
      protein: draft?.foods.reduce((sum, food) => sum + (food.protein ?? 0), 0) ?? 0,
      fat: draft?.foods.reduce((sum, food) => sum + (food.fat ?? 0), 0) ?? 0,
    }),
    [draft?.foods],
  );

  const handleHardwareBack = () => {
    if (view === 'edit' || view === 'add') setView('review');
    else if (view === 'analysis') setView('photo');
    else if (view === 'review') requestLeave('close');
    else closeAll();
  };

  if (!draft) return null;

  const homeButton = (
    <IconButton
      accessibilityLabel="홈으로"
      icon={<HouseIcon color={colors.textPrimary} height={24} width={24} />}
      onPress={() => requestLeave('home')}
      size={44}
    />
  );
  const editingFood = draft.foods.find((food) => food.id === editingFoodId) ?? null;
  const canSave = draft.foods.length > 0 && draft.foods.every((food) => food.amount > 0);

  return (
    <Modal
      animationType="slide"
      onRequestClose={handleHardwareBack}
      statusBarTranslucent
      visible={visible}
    >
      {view === 'photo' ? (
        <SubScreen
          footer={
            <AppButton
              disabled={!draft.photoUri}
              onPress={() => setView('analysis')}
              title="음식 찾기"
            />
          }
          onBack={closeAll}
          title={`${mealLabel} 기록`}
        >
          <PhotoBox uri={draft.photoUri} />
          <Text style={styles.caption}>밝은 곳에서 음식이 잘 보이게 찍어 주세요.</Text>
          <View style={styles.options}>
            <OptionRow
              caption="지금 먹을 음식을 찍어요"
              Icon={CameraIcon}
              onPress={() => void selectPhoto('camera')}
              title="사진 찍기"
            />
            <OptionRow
              caption="찍어 둔 사진을 골라요"
              Icon={ImageIcon}
              onPress={() => void selectPhoto('gallery')}
              title="앨범에서 고르기"
            />
          </View>
        </SubScreen>
      ) : null}

      {view === 'analysis' && draft.photoUri ? (
        <SubScreen onBack={() => setView('photo')} title={`${mealLabel} 기록`}>
          <AnalysisProgress imageUri={draft.photoUri} onComplete={finishImageAnalysis} />
        </SubScreen>
      ) : null}

      {view === 'review' ? (
        <SubScreen
          footer={
            <AppButton
              disabled={!canSave}
              loading={isSaving}
              onPress={() => void handleSave()}
              title="이대로 기록하기"
            />
          }
          gap={16}
          onBack={() => requestLeave('close')}
          right={homeButton}
          title={`${mealLabel} 기록`}
        >
          <PhotoBox uri={draft.photoUri} />
          <Text accessibilityRole="header" style={styles.heading}>
            {draft.foods.length
              ? `음식 ${draft.foods.length}개를 찾았어요`
              : '먹은 음식을 추가해 주세요'}
          </Text>
          {draft.foods.length > 0 ? (
            <View style={styles.listCard}>
              {draft.foods.map((food, index) => (
                <Pressable
                  key={food.id}
                  accessibilityLabel={`${food.name} 고치기`}
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingFoodId(food.id);
                    setView('edit');
                  }}
                  style={({ pressed }) => [
                    styles.foodRow,
                    index > 0 && styles.divider,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.foodName}>
                      {food.name}
                    </Text>
                    <Text style={food.amount > 0 ? styles.caption : styles.warningCaption}>
                      {foodSummary(food)}
                    </Text>
                  </View>
                  <PencilIcon color={colors.textSecondary} height={18} width={18} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <AppButton
            fullWidth={false}
            onPress={() => setView('add')}
            size="S"
            style={styles.addButton}
            title="+ 음식 추가"
            variant="outline"
          />
          {draft.foods.length > 0 ? (
            <View style={styles.totalCard}>
              <Text style={styles.totalTitle}>합계 {Math.round(totals.kcal)}kcal</Text>
              <Text style={styles.body}>
                탄수화물 {Math.round(totals.carbs)}g · 단백질 {Math.round(totals.protein)}g · 지방{' '}
                {Math.round(totals.fat)}g
              </Text>
            </View>
          ) : null}
        </SubScreen>
      ) : null}

      {view === 'edit' && editingFood ? (
        <FoodEditor
          initialFood={editingFood}
          mode="edit"
          onBack={() => setView('review')}
          onDelete={() => deleteFood(editingFood.id)}
          onHome={() => requestLeave('home')}
          onSave={saveFood}
        />
      ) : null}

      {view === 'add' ? (
        <FoodEditor
          initialFood={null}
          mode="add"
          onBack={() => setView('review')}
          onHome={() => requestLeave('home')}
          onSave={saveFood}
        />
      ) : null}

      <AppDialog
        cancelText="계속 기록하기"
        confirmText="나가기"
        description="찾은 음식과 고친 내용은 저장되지 않아요."
        onCancel={() => setLeaveTarget(null)}
        onConfirm={() => {
          const target = leaveTarget;
          closeAll();
          if (target === 'home') router.navigate('/home');
        }}
        title="기록하지 않고 나갈까요?"
        visible={leaveTarget !== null}
      />
    </Modal>
  );
}

function PhotoBox({ uri }: { uri: string | null }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.photoBox}>
      {uri ? (
        <Image
          accessibilityLabel="찍은 사진"
          resizeMode="cover"
          source={{ uri }}
          style={styles.photo}
        />
      ) : (
        <>
          <ImageIcon color={colors.textSecondary} height={28} width={28} />
          <Text style={styles.caption}>찍은 사진</Text>
        </>
      )}
    </View>
  );
}

function OptionRow({
  caption,
  Icon,
  onPress,
  title,
}: {
  caption: string;
  Icon: ComponentType<SvgProps>;
  onPress: () => void;
  title: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.optionIcon}>
        <Icon color={colors.textPrimary} height={22} width={22} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.foodName}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
    </Pressable>
  );
}

// TEMP: the progress is simulated until food recognition is connected.
function AnalysisProgress({ imageUri, onComplete }: { imageUri: string; onComplete: () => void }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const progress = useTemporaryAdjustmentProgress();
  const completionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stages = ['음식 종류 찾기', '칼로리 · 영양 성분 계산'];
  const stageIndex = progress >= 1 ? 2 : progress >= 0.5 ? 1 : 0;

  useEffect(() => {
    if (progress < 1 || completionRef.current) return;
    completionRef.current = setTimeout(onComplete, 320);
    return () => {
      if (completionRef.current) clearTimeout(completionRef.current);
      completionRef.current = null;
    };
  }, [onComplete, progress]);

  return (
    <View style={styles.analysis}>
      <Image resizeMode="cover" source={{ uri: imageUri }} style={styles.analysisPhoto} />
      <Text accessibilityRole="header" style={styles.heading}>
        음식을 찾고 있어요
      </Text>
      <ProgressBar value={progress} />
      <View style={styles.stages}>
        {stages.map((label, index) => (
          <View key={label} style={styles.stageRow}>
            <View style={[styles.stageDot, index < stageIndex && styles.stageDotDone]}>
              {index < stageIndex ? (
                <CheckIcon color={colors.onPrimary} height={12} width={12} />
              ) : null}
            </View>
            <Text style={index <= stageIndex ? styles.body : styles.caption}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Figma D3: pick the right food, then how much was eaten. The finish button comes first and
// "지우기" second (user's choice, 10/29).
function FoodEditor({
  initialFood,
  mode,
  onBack,
  onDelete,
  onHome,
  onSave,
}: {
  initialFood: RecordedFood | null;
  mode: 'edit' | 'add';
  onBack: () => void;
  onDelete?: () => void;
  onHome: () => void;
  onSave: (food: RecordedFood) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [food, setFood] = useState<RecordedFood | null>(initialFood);
  // Nutrition is scaled from this one so typing an amount down to zero and back keeps it.
  const [reference, setReference] = useState<RecordedFood | null>(initialFood);
  const [gramsText, setGramsText] = useState(
    initialFood && initialFood.amount > 0 ? String(initialFood.amount) : '',
  );
  const [query, setQuery] = useState('');
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const trimmedQuery = query.trim();
  const searchResults = trimmedQuery
    ? foodDatabase.filter((item) =>
        item.name.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()),
      )
    : [];
  const candidates = foodDatabase.slice(0, 4);
  const showCurrentAsOwnRow =
    food !== null && !candidates.some((item) => item.id === food.databaseId);

  const choose = (selection: FoodSelection) => {
    const id = food?.id ?? initialFood?.id ?? newFoodId();
    const next =
      selection.kind === 'database'
        ? databaseFoodToRecorded(selection.food, id)
        : createCustomFood(selection.name, id);
    setFood(next);
    setReference(next);
    setGramsText(next.amount > 0 ? String(next.amount) : '');
    setQuery('');
    setNutritionOpen(selection.kind === 'custom');
    Keyboard.dismiss();
  };

  const setAmount = (amount: number) => {
    if (!food || !reference) return;
    const scaled = scaleFoodToAmount(reference, amount);
    setFood(scaled);
    setGramsText(amount > 0 ? String(Math.round(amount)) : '');
  };

  const setNutrient = (key: NutrientKey, text: string) => {
    if (!food) return;
    const digits = onlyNumeric(text);
    const next = { ...food, [key]: digits === '' ? undefined : Number(digits) };
    setFood(next);
    setReference(next.amount > 0 ? next : { ...next, amount: next.baseAmount ?? 300 });
  };

  const canFinish = Boolean(food && food.name.trim() && food.amount > 0);
  const finish = () => {
    if (!food || !canFinish) return;
    Keyboard.dismiss();
    onSave(food);
  };

  return (
    <SubScreen
      footer={
        mode === 'edit' ? (
          <View style={styles.footerRow}>
            <AppButton
              disabled={!canFinish}
              onPress={finish}
              style={styles.flex}
              title="고치기 완료"
            />
            <AppButton
              fullWidth={false}
              labelStyle={styles.deleteLabel}
              onPress={() => onDelete?.()}
              style={styles.deleteButton}
              title="지우기"
              variant="secondary"
            />
          </View>
        ) : (
          <AppButton disabled={!canFinish} onPress={finish} title="추가하기" />
        )
      }
      gap={16}
      onBack={onBack}
      right={
        <IconButton
          accessibilityLabel="홈으로"
          icon={<HouseIcon color={colors.textPrimary} height={24} width={24} />}
          onPress={onHome}
          size={44}
        />
      }
      title={mode === 'edit' ? '음식 고치기' : '음식 추가'}
    >
      <View style={styles.searchField}>
        <TextInput
          accessibilityLabel="음식 이름으로 찾기"
          onChangeText={setQuery}
          placeholder="음식 이름으로 찾기"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        <SearchIcon color={colors.textSecondary} height={22} width={22} />
      </View>
      {trimmedQuery ? (
        <View style={styles.listCard}>
          {searchResults.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => choose({ kind: 'database', food: item })}
              style={({ pressed }) => [
                styles.resultRow,
                index > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.foodName, styles.flex]}>{item.name}</Text>
              <Text style={styles.caption}>{item.kcal}kcal</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => choose({ kind: 'custom', name: trimmedQuery })}
            style={({ pressed }) => [
              styles.resultRow,
              searchResults.length > 0 && styles.divider,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.body, styles.flex]}>&lsquo;{trimmedQuery}&rsquo; 그대로 적기</Text>
            <CaretRightIcon color={colors.textSecondary} height={18} width={18} />
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        {mode === 'edit' ? '사진과 비슷한 음식' : '음식 고르기'}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.listCard}>
        {showCurrentAsOwnRow && food ? (
          <CandidateRow name={food.name} selected summary={foodSummary(food)} />
        ) : null}
        {candidates.map((item, index) => (
          <CandidateRow
            key={item.id}
            divider={index > 0 || showCurrentAsOwnRow}
            name={item.name}
            onPress={() => choose({ kind: 'database', food: item })}
            selected={food?.databaseId === item.id}
            summary={`1인분(${item.amount}${item.unit}) · ${item.kcal}kcal`}
          />
        ))}
      </View>

      {food ? (
        <>
          <Text style={styles.sectionTitle}>먹은 양</Text>
          <View style={styles.servingRow}>
            {servingPresets.map((ratio) => {
              const amount = Math.round((food.baseAmount ?? 300) * ratio);
              return (
                <Chip
                  key={ratio}
                  label={`${ratio}인분`}
                  onPress={() => setAmount(amount)}
                  selected={food.amount === amount}
                  style={styles.servingChip}
                />
              );
            })}
          </View>
          <AppTextField
            accessibilityLabel="먹은 양"
            keyboardType="numeric"
            maxLength={4}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '');
              setGramsText(digits);
              if (reference) setFood(scaleFoodToAmount(reference, Number(digits || 0)));
            }}
            placeholder="먹은 양"
            rightElement={<Text style={styles.unit}>{food.unit}</Text>}
            value={gramsText}
          />
          <View style={styles.nutritionBox}>
            <Text style={styles.body}>{nutritionLine(food)}</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setNutritionOpen((open) => !open)}
            >
              <Text style={styles.link}>{nutritionOpen ? '접기' : '영양 정보 직접 고치기'}</Text>
            </Pressable>
            {nutritionOpen ? (
              <View style={styles.nutrientGrid}>
                {nutrientFields.map((field) => (
                  <AppTextField
                    key={field.key}
                    accessibilityLabel={field.label}
                    containerStyle={styles.nutrientField}
                    keyboardType="decimal-pad"
                    label={field.label}
                    onChangeText={(text) => setNutrient(field.key, text)}
                    rightElement={<Text style={styles.unit}>{field.unit}</Text>}
                    value={food[field.key] === undefined ? '' : String(food[field.key])}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </SubScreen>
  );
}

function CandidateRow({
  divider = false,
  name,
  onPress,
  selected,
  summary,
}: {
  divider?: boolean;
  name: string;
  onPress?: () => void;
  selected: boolean;
  summary: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.foodRow,
        divider && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.flex}>
        <Text style={selected ? styles.foodName : styles.foodNameRegular}>{name}</Text>
        <Text style={styles.caption}>{summary}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <CheckIcon color={colors.onPrimary} height={14} width={14} /> : null}
      </View>
    </Pressable>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  const inputText = easyMode ? scaleForEasyMode(text.body1) : text.body1;
  return {
    flex: { flex: 1 },
    heading: { ...text.title2, color: colors.textPrimary },
    sectionTitle: { ...text.body2Strong, color: colors.textPrimary, marginTop: 4 },
    body: { ...text.body2, color: colors.textBody },
    caption: { ...text.caption, color: colors.textSecondary },
    warningCaption: { ...text.caption, color: colors.warning },
    link: { ...text.body2Strong, color: colors.textSecondary, textDecorationLine: 'underline' },
    unit: { ...text.body2, color: colors.textSecondary },
    photoBox: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: 6,
      height: 160,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    photo: { height: '100%', width: '100%' },
    options: { gap: 12 },
    option: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 16,
      minHeight: easyMode ? 88 : 76,
      paddingHorizontal: 20,
    },
    optionIcon: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    listCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    foodRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: easyMode ? 80 : 72,
      paddingVertical: 12,
    },
    resultRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: easyMode ? 60 : 52,
    },
    divider: { borderTopColor: colors.border, borderTopWidth: 1 },
    foodName: { ...text.body1Strong, color: colors.textPrimary },
    foodNameRegular: { ...text.body1, color: colors.textPrimary },
    addButton: { alignSelf: 'flex-start' },
    totalCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: 4,
      padding: 16,
    },
    totalTitle: { ...text.body1Strong, color: colors.textPrimary },
    analysis: { gap: 16 },
    analysisPhoto: { borderRadius: radius.card, height: 200, width: '100%' },
    stages: { gap: 10 },
    stageRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    stageDot: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1.5,
      height: 20,
      justifyContent: 'center',
      width: 20,
    },
    stageDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    searchField: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      height: easyMode ? 60 : 52,
      paddingHorizontal: 16,
    },
    searchInput: {
      ...inputText,
      color: colors.textPrimary,
      flex: 1,
      height: '100%',
      lineHeight: undefined,
      padding: 0,
      ...noWebFocusRing,
    },
    radio: {
      alignItems: 'center',
      borderColor: colors.textDisabled,
      borderRadius: 12,
      borderWidth: 1.5,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    servingRow: { flexDirection: 'row', gap: 8 },
    servingChip: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
    nutritionBox: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      gap: 10,
      padding: 16,
    },
    nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    nutrientField: { flexBasis: '45%', flexGrow: 1 },
    footerRow: { flexDirection: 'row', gap: 8 },
    deleteButton: { width: 110 },
    deleteLabel: { color: colors.danger },
    pressed: { opacity: 0.75 },
  } as const;
}
