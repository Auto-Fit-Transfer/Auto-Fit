import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  BackHandler,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BarbellIcon from '@/assets/icons/deco/Barbell.svg';
import BarbellFillIcon from '@/assets/icons/deco/Barbell_Fill.svg';
import BandIcon from '@/assets/icons/deco/Band.svg';
import FirstAidIcon from '@/assets/icons/deco/FirstAid_Fill.svg';
import HandHeartFillIcon from '@/assets/icons/deco/HandHeart_Fill.svg';
import HouseIcon from '@/assets/icons/deco/HouseLine.svg';
import LeafIcon from '@/assets/icons/deco/Leaf.svg';
import MachineIcon from '@/assets/icons/deco/Machine.svg';
import MapPinIcon from '@/assets/icons/deco/MapPin_Fill.svg';
import PersonIcon from '@/assets/icons/deco/Person.svg';
import SparkleIcon from '@/assets/icons/deco/Sparkle_Fill.svg';
import ClockFillIcon from '@/assets/icons/input/Clock_Fill.svg';
import CheckCircleFillIcon from '@/assets/icons/system/CheckCircle_Fill.svg';
import DotsThreeCircleVerticalIcon from '@/assets/icons/system/DotsThreeCircleVertical.svg';
import DotsThreeOutlineIcon from '@/assets/icons/system/DotsThreeOutline.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { BackButton } from '@/src/components/common/BackButton';
import { ExerciseActionButton } from '@/src/components/exercise/ExerciseActionButton';
import { ExerciseScreenFrame } from '@/src/components/exercise/ExerciseScreenFrame';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import {
  exerciseEquipmentLabels,
  exerciseLocationLabels,
  initialExerciseCondition,
  type ExerciseCondition,
  type ExerciseEquipment,
  type ExerciseLocation,
} from '@/src/features/exercise/exerciseData';
import { colors, fontFamilies } from '@/src/theme';

const referenceHeight = 917;
const minimumScreenHeight = 740;
const keyboardSafeGap = 20;
const expandedCtaTop = 820;
const compactCtaTop = 777;
const ctaHeight = 45;
const times = [30, 45, 60, 90, 120];
const locations: { id: ExerciseLocation; Icon: ComponentType<any> }[] = [
  { id: 'gym', Icon: BarbellIcon },
  { id: 'home', Icon: HouseIcon },
  { id: 'outdoor', Icon: LeafIcon },
  { id: 'other', Icon: DotsThreeCircleVerticalIcon },
];
const equipment = Object.keys(exerciseEquipmentLabels) as ExerciseEquipment[];
const equipmentIcons: Record<ExerciseEquipment, ComponentType<any>> = {
  machine: MachineIcon,
  band: BandIcon,
  dumbbell: BarbellIcon,
  bodyweight: PersonIcon,
  other: DotsThreeOutlineIcon,
};
type FocusedInput = 'condition' | 'discomfort' | null;

function cloneExerciseCondition(condition: ExerciseCondition): ExerciseCondition {
  return {
    ...condition,
    equipment: [...condition.equipment],
  };
}

export default function ExerciseConditionScreen() {
  const router = useRouter();
  const { source: sourceParam } = useLocalSearchParams<{ source?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { condition: savedCondition, generateRoutine } = useExerciseRoutine();
  const source = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;
  const isConditionReset = source === 'summary';
  const conditionInputRef = useRef<TextInput>(null);
  const discomfortInputRef = useRef<TextInput>(null);
  const focusedInputRef = useRef<FocusedInput>(null);
  const blurFrameRef = useRef<number | null>(null);
  const keyboardContentOffsetRef = useRef(0);
  const [condition, setCondition] = useState(() =>
    cloneExerciseCondition(isConditionReset ? savedCondition : initialExerciseCondition),
  );
  const [focusedInput, setFocusedInput] = useState<FocusedInput>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardContentOffset, setKeyboardContentOffset] = useState(0);
  const responsiveHeight =
    Platform.OS === 'android' ? Dimensions.get('screen').height : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(1, (responsiveHeight - minimumScreenHeight) / (referenceHeight - minimumScreenHeight)),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const availableWidth = windowWidth - insets.left - insets.right;
  const dietWidthScale = Math.min(1, availableWidth / 412);
  const frameWidthScale = Math.min(1, windowWidth / 412);
  const dietCanvasTop = Math.max(0, insets.top + 8 - 38 * dietWidthScale);
  const titleTop =
    (dietCanvasTop + verticalValue(38, 30) * dietWidthScale) / Math.max(frameWidthScale, 0.01);
  const ctaTop = verticalValue(expandedCtaTop, compactCtaTop);
  const layout = {
    cardHeight: verticalValue(100, 96),
    cardPadding: verticalValue(12.5, 11),
    ctaTop,
    choiceHeight: verticalValue(40, 38),
    discomfortHeight: verticalValue(124, 120),
    discomfortPadding: verticalValue(10, 9),
    equipmentButtonHeight: verticalValue(65, 62),
    equipmentHeight: verticalValue(138, 130),
    equipmentPadding: verticalValue(14, 12),
    formGap: verticalValue(10, 10),
    formTop: verticalValue(200, 185),
    inputHeight: verticalValue(34, 32),
    introDescriptionMargin: verticalValue(9, 6),
    introTop: verticalValue(100, 85),
  };
  const contentHeight = ctaTop + ctaHeight;

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboardTop(event.endCoordinates.screenY),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardContentOffsetRef.current = 0;
      setKeyboardTop(null);
      setKeyboardContentOffset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || focusedInput === null || keyboardTop === null)
      return undefined;
    const frame = requestAnimationFrame(() =>
      discomfortInputRef.current?.measureInWindow((_x, y, _width, height) => {
        const nextOffset = Math.max(
          0,
          y + height + keyboardContentOffsetRef.current - (keyboardTop - keyboardSafeGap),
        );
        keyboardContentOffsetRef.current = nextOffset;
        setKeyboardContentOffset(nextOffset);
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focusedInput, keyboardTop]);
  useEffect(
    () => () => {
      if (blurFrameRef.current !== null) cancelAnimationFrame(blurFrameRef.current);
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (isConditionReset) router.back();
    else router.replace('/exercise');
  }, [isConditionReset, router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    return () => subscription.remove();
  }, [handleBack]);

  const toggleEquipment = (id: ExerciseEquipment) =>
    setCondition((current) => ({
      ...current,
      equipment: current.equipment.includes(id)
        ? current.equipment.filter((item) => item !== id)
        : [...current.equipment, id],
    }));
  const handleInputFocus = useCallback((input: Exclude<FocusedInput, null>) => {
    focusedInputRef.current = input;
    if (blurFrameRef.current !== null) {
      cancelAnimationFrame(blurFrameRef.current);
      blurFrameRef.current = null;
    }
    setFocusedInput(input);
  }, []);
  const handleInputBlur = useCallback(() => {
    focusedInputRef.current = null;
    blurFrameRef.current = requestAnimationFrame(() => {
      blurFrameRef.current = null;
      if (focusedInputRef.current !== null) return;
      keyboardContentOffsetRef.current = 0;
      setFocusedInput(null);
      setKeyboardContentOffset(0);
    });
  }, []);
  const handleGenerate = async () => {
    if (isGenerating) return;
    const conditionLevel = condition.condition.trim();
    if (condition.availableMinutes === null) {
      Alert.alert('운동 시간을 선택해 주세요.');
      return;
    }
    if (condition.location === null) {
      Alert.alert('운동 장소를 선택해 주세요.');
      return;
    }
    if (!conditionLevel) {
      Alert.alert('현재 컨디션을 입력해 주세요.');
      return;
    }
    if (conditionLevel.length > 30) {
      Alert.alert('현재 컨디션은 30자 이하로 입력해 주세요.');
      return;
    }

    setIsGenerating(true);
    try {
      await generateRoutine({ ...condition, condition: conditionLevel });
      requestAnimationFrame(() => {
        if (isConditionReset) router.dismissTo('/exercise/summary');
        else router.push('/exercise/summary');
      });
    } catch (error) {
      console.error('Exercise recommendation generation failed:', error);
      Alert.alert('맞춤 루틴 생성 실패', getExerciseApiErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ExerciseScreenFrame contentHeight={contentHeight}>
      <View style={{ transform: [{ translateY: -keyboardContentOffset }] }}>
        <BackButton
          onPress={handleBack}
          style={[styles.back, { top: titleTop - 15 }]}
        />
        <Text style={[styles.screenTitle, { top: titleTop }]}>컨디션 입력</Text>
        <View style={[styles.intro, { top: layout.introTop }]}>
          <Text style={styles.introTitle}>
            운동 환경과{'\n'}
            <Text style={styles.introAccent}>현재 상태를 알려주세요</Text>
          </Text>
          <Text style={[styles.introDescription, { marginTop: layout.introDescriptionMargin }]}>
            입력한 정보를 바탕으로 오늘의 맞춤 루틴을 만들어 드려요
          </Text>
        </View>
        <View style={[styles.form, { gap: layout.formGap, top: layout.formTop }]}>
          <FormCard
            Icon={ClockFillIcon}
            style={{ height: layout.cardHeight, paddingVertical: layout.cardPadding }}
            title="운동 가능 시간"
          >
            <View style={styles.row}>
              {times.map((minutes) => (
                <Choice
                  height={layout.choiceHeight}
                  key={minutes}
                  selected={condition.availableMinutes === minutes}
                  label={minutes === 120 ? '120분 이상' : `${minutes}분`}
                  onPress={() => setCondition({ ...condition, availableMinutes: minutes })}
                />
              ))}
            </View>
          </FormCard>
          <FormCard
            Icon={MapPinIcon}
            style={{ height: layout.cardHeight, paddingVertical: layout.cardPadding }}
            title="운동 장소"
          >
            <View style={styles.row}>
              {locations.map(({ Icon, id }) => (
                <Choice
                  height={layout.choiceHeight}
                  key={id}
                  Icon={Icon}
                  selected={condition.location === id}
                  label={exerciseLocationLabels[id]}
                  onPress={() => setCondition({ ...condition, location: id })}
                />
              ))}
            </View>
          </FormCard>
          <FormCard
            Icon={BarbellFillIcon}
            style={{ height: layout.equipmentHeight, paddingVertical: layout.equipmentPadding }}
            title={
              <>
                사용 가능한 장비 <Text style={styles.titleAside}>(복수 선택)</Text>
              </>
            }
          >
            <View style={styles.equipmentRow}>
              {equipment.map((id) => {
                const selected = condition.equipment.includes(id);
                const EquipmentIcon = equipmentIcons[id];
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleEquipment(id)}
                    style={[
                      styles.equipmentChoice,
                      { height: layout.equipmentButtonHeight },
                      selected && styles.choiceSelected,
                    ]}
                  >
                    <EquipmentIcon
                      color={selected ? colors.primary : colors.textSecondary}
                      height={25}
                      width={25}
                    />
                    <Text style={[styles.equipmentText, selected && styles.choiceTextSelected]}>
                      {exerciseEquipmentLabels[id]}
                    </Text>
                    {selected ? <SelectionCheck /> : null}
                  </Pressable>
                );
              })}
            </View>
          </FormCard>
          <FormCard
            Icon={FirstAidIcon}
            style={{ height: layout.cardHeight, paddingVertical: layout.cardPadding }}
            title="현재 컨디션"
          >
            <TextInput
              ref={conditionInputRef}
              onBlur={handleInputBlur}
              onChangeText={(value) => setCondition({ ...condition, condition: value })}
              onFocus={() => handleInputFocus('condition')}
              placeholder="예) 좋음, 보통, 나쁨, 매우 피곤 등"
              placeholderTextColor={colors.textDisabled}
              style={[styles.input, { height: layout.inputHeight }]}
              value={condition.condition}
            />
          </FormCard>
          <FormCard
            description={
              '운동 시 불편하거나 주의가 필요한 부위를 알려주세요.\n없을 시 생략 가능합니다.'
            }
            Icon={HandHeartFillIcon}
            style={{ height: layout.discomfortHeight, paddingVertical: layout.discomfortPadding }}
            title={
              <>
                운동 시 불편한 부위 <Text style={styles.titleAside}>(선택)</Text>
              </>
            }
          >
            <TextInput
              ref={discomfortInputRef}
              onBlur={handleInputBlur}
              onChangeText={(value) => setCondition({ ...condition, discomfortArea: value })}
              onFocus={() => handleInputFocus('discomfort')}
              placeholder="예) 오른쪽 무릎, 허리, 어깨 등"
              placeholderTextColor={colors.textDisabled}
              style={[styles.input, { height: layout.inputHeight }]}
              value={condition.discomfortArea}
            />
          </FormCard>
        </View>
        <View
          pointerEvents={isGenerating ? 'none' : 'auto'}
          style={[styles.cta, { top: layout.ctaTop }, isGenerating && styles.ctaLoading]}
        >
          <ExerciseActionButton
            borderRadius={10}
            gap={10}
            gradient
            icon={<SparkleIcon color={colors.surface} height={22} width={22} />}
            labelStyle={styles.ctaLabel}
            onPress={() => void handleGenerate()}
            title="맞춤 루틴 만들기"
          />
        </View>
      </View>
    </ExerciseScreenFrame>
  );
}

function FormCard({
  children,
  description,
  Icon,
  style,
  title,
}: {
  children: ReactNode;
  description?: string;
  Icon: ComponentType<any>;
  style?: ViewStyle;
  title: ReactNode;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={[styles.cardTitleRow, description && styles.cardTitleWithDescription]}>
        <Icon color={colors.primary} height={25} width={25} />
        <View>
          <Text style={styles.cardTitle}>{title}</Text>
          {description ? <Text style={styles.helper}>{description}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function Choice({
  height,
  Icon,
  label,
  onPress,
  selected,
}: {
  height: number;
  Icon?: ComponentType<any>;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, { height }, selected && styles.choiceSelected]}
    >
      {Icon ? (
        <Icon color={selected ? colors.primary : colors.textSecondary} height={16} width={16} />
      ) : null}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
      {selected ? <SelectionCheck /> : null}
    </Pressable>
  );
}

function SelectionCheck() {
  const id = useId().replace(/:/g, '');
  const gradientId = `exercise-condition-check-gradient-${id}`;
  const maskId = `exercise-condition-check-mask-${id}`;

  return (
    <View pointerEvents="none" style={styles.selectionCheck}>
      <Svg height={15} viewBox="0 0 15 15" width={15}>
        <Defs>
          <LinearGradient
            gradientUnits="userSpaceOnUse"
            id={gradientId}
            x1="10.8516"
            x2="3.6914"
            y1="2.625"
            y2="12.375"
          >
            <Stop offset="0" stopColor="#49CDB1" />
            <Stop offset="0.2" stopColor="#42C0A6" />
            <Stop offset="0.4" stopColor="#49CDB1" />
            <Stop offset="0.600962" stopColor="#42C0A6" />
            <Stop offset="0.8" stopColor="#49CDB1" />
            <Stop offset="1" stopColor="#42C0A6" />
          </LinearGradient>
          <Mask height={15} id={maskId} maskUnits="userSpaceOnUse" width={15} x={0} y={0}>
            <CheckCircleFillIcon color="#FFFFFF" height={15} width={15} />
          </Mask>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height={15} mask={`url(#${maskId})`} width={15} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { left: 10, position: 'absolute', top: 32 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    includeFontPadding: false,
  },
  cardTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  cardTitleWithDescription: { alignItems: 'flex-start' },
  choice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    paddingHorizontal: 3,
    position: 'relative',
  },
  choiceSelected: { backgroundColor: '#F5FFFC', borderColor: colors.primary },
  choiceText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    includeFontPadding: false,
  },
  choiceTextSelected: { color: colors.primaryDark },
  cta: { left: 21, position: 'absolute', width: 370 },
  ctaLabel: { fontFamily: fontFamilies.pretendardMedium, fontSize: 20, lineHeight: 24 },
  ctaLoading: { opacity: 0.7 },
  equipmentChoice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    justifyContent: 'center',
    position: 'relative',
    width: 60,
  },
  equipmentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  equipmentText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    includeFontPadding: false,
  },
  form: { left: 21, position: 'absolute', width: 370 },
  helper: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    lineHeight: 16,
    marginTop: 3,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 5,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  intro: { left: 21, position: 'absolute', width: 370 },
  introAccent: { color: colors.primaryDark },
  introDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 22,
    lineHeight: 30,
  },
  row: { flexDirection: 'row', gap: 5 },
  screenTitle: {
    alignSelf: 'center',
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    letterSpacing: 1.5,
    position: 'absolute',
    top: 38,
  },
  selectionCheck: { height: 15, position: 'absolute', right: -1, top: -1, width: 15 },
  titleAside: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
  },
});
