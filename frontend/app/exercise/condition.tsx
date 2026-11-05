import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HouseIcon from '@/assets/icons/ui/house.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { getExerciseApiErrorMessage } from '@/src/api/exercise';
import { useExerciseRoutine } from '@/src/features/exercise/ExerciseRoutineContext';
import {
  exerciseEquipmentLabels,
  exerciseLocationLabels,
  initialExerciseCondition,
  type ExerciseCondition,
  type ExerciseEquipment,
  type ExerciseLocation,
} from '@/src/features/exercise/exerciseData';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { Text, TextInput } from '@/src/components/common';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

const timeOptions = [30, 45, 60, 90, 120];
const locationOptions: ExerciseLocation[] = ['gym', 'home', 'outdoor', 'other'];
const equipmentOptions: ExerciseEquipment[] = [
  'bodyweight',
  'band',
  'dumbbell',
  'machine',
  'other',
];
const conditionOptions = ['좋음', '보통', '피곤해요', '안 좋아요'];

export default function ExerciseConditionScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const { source, discomfortArea } = useLocalSearchParams<{ source?: string; discomfortArea?: string }>();
  const { condition: savedCondition, generateRoutine } = useExerciseRoutine();
  const isChanging = source === 'summary';
  const [initial] = useState<ExerciseCondition>(() =>
    isChanging
      ? { ...savedCondition, equipment: [...savedCondition.equipment] }
      : { ...initialExerciseCondition, equipment: [], discomfortArea: discomfortArea?.slice(0, 50) ?? '' },
  );
  const [condition, setCondition] = useState<ExerciseCondition>(initial);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const goBack = useCallback(
    () => (isChanging ? router.back() : router.replace('/exercise')),
    [isChanging, router],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  const goHome = () => {
    setLeaveDialogOpen(false);
    router.replace('/home');
  };
  const toggleEquipment = (id: ExerciseEquipment) =>
    setCondition((current) => ({
      ...current,
      equipment: current.equipment.includes(id)
        ? current.equipment.filter((item) => item !== id)
        : [...current.equipment, id],
    }));

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (
      condition.availableMinutes === null ||
      condition.location === null ||
      !condition.condition.trim()
    ) {
      Alert.alert('운동 설정을 확인해 주세요', '운동 시간, 장소, 오늘 컨디션을 선택해 주세요.');
      return;
    }
    if (condition.discomfortArea.trim().length > 50) {
      Alert.alert('불편한 부위를 확인해 주세요', '50자 이하로 입력해 주세요.');
      return;
    }
    setIsGenerating(true);
    Keyboard.dismiss();
    try {
      await generateRoutine({
        ...condition,
        condition: condition.condition.trim(),
        discomfortArea: condition.discomfortArea.trim(),
      });
      if (isChanging) router.dismissTo('/exercise/summary');
      else router.push('/exercise/summary');
    } catch (error) {
      Alert.alert('맞춤 운동을 만들지 못했어요', getExerciseApiErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScreenHeader
        onBack={goBack}
        right={(
          <Pressable
            accessibilityLabel="홈으로 가기"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => (JSON.stringify(condition) === JSON.stringify(initial) ? goHome() : setLeaveDialogOpen(true))}
          >
            <HouseIcon color={colors.textPrimary} height={24} width={24} />
          </Pressable>
        )}
        title="오늘의 운동 설정"
      />
      {simple ? <View style={styles.readRow}><SimpleReadButton text="오늘의 운동 설정입니다. 운동할 시간, 장소, 쓸 수 있는 기구, 오늘 컨디션을 차례로 고르세요. 불편한 곳은 선택 사항입니다." /></View> : null}
      <ScrollView
        contentContainerStyle={[styles.content, simple && simpleStyles.content]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ChoiceSection title="운동할 수 있는 시간">
          {timeOptions.map((minutes) => (
            <Chip
              key={minutes}
              label={minutes === 120 ? '120분 이상' : String(minutes) + '분'}
              selected={condition.availableMinutes === minutes}
              onPress={() => setCondition((current) => ({ ...current, availableMinutes: minutes }))}
            />
          ))}
        </ChoiceSection>
        <ChoiceSection title="어디서 하나요?">
          {locationOptions.map((location) => (
            <Chip
              key={location}
              label={exerciseLocationLabels[location]}
              selected={condition.location === location}
              onPress={() => setCondition((current) => ({ ...current, location }))}
            />
          ))}
        </ChoiceSection>
        <ChoiceSection title="쓸 수 있는 기구" hint="여러 개 고를 수 있어요">
          {equipmentOptions.map((equipment) => (
            <Chip
              key={equipment}
              label={exerciseEquipmentLabels[equipment]}
              multiple
              selected={condition.equipment.includes(equipment)}
              onPress={() => toggleEquipment(equipment)}
            />
          ))}
        </ChoiceSection>
        <ChoiceSection title="오늘 컨디션">
          {conditionOptions.map((value) => (
            <Chip
              key={value}
              label={value}
              selected={condition.condition === value}
              onPress={() => setCondition((current) => ({ ...current, condition: value }))}
            />
          ))}
        </ChoiceSection>
        <View style={styles.discomfort}>
          <Text style={styles.discomfortTitle}>불편한 곳 (선택)</Text>
          <TextInput
            accessibilityLabel="불편한 부위"
            maxLength={50}
            onChangeText={(value) =>
              setCondition((current) => ({ ...current, discomfortArea: value }))
            }
            placeholder="예) 오른쪽 무릎, 허리"
            placeholderTextColor={colors.textDisabled}
            style={[styles.input, simple && simpleStyles.input]}
            value={condition.discomfortArea}
          />
          <Text style={styles.helper}>적어 주시면 그 부위는 피해서 추천해요.</Text>
        </View>
        <View style={styles.notice}>
          <WarningIcon color={colors.warning} height={20} width={20} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>주의</Text>
            <Text style={styles.noticeText}>통증이 심하면 운동을 멈추고 전문가와 상담해 주세요.</Text>
          </View>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isGenerating, disabled: isGenerating }}
          disabled={isGenerating}
          onPress={() => void handleGenerate()}
          style={({ pressed }) => [styles.button, simple && simpleStyles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>
            {isGenerating ? '맞춤 운동 만드는 중…' : '맞춤 운동 만들기'}
          </Text>
        </Pressable>
      </View>
      <ConfirmDialog
        description="고른 내용은 저장되지 않아요."
        onPrimary={goHome}
        onSecondary={() => setLeaveDialogOpen(false)}
        primaryLabel="나가기"
        secondaryLabel="계속 고르기"
        title="홈으로 나갈까요?"
        visible={leaveDialogOpen}
      />
    </KeyboardAvoidingView>
  );
}

function ChoiceSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle]}>
        {title}
        {hint ? <Text style={styles.sectionHint}> {hint}</Text> : null}
      </Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  multiple = false,
  selected,
  onPress,
}: {
  label: string;
  multiple?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={multiple ? { checked: selected } : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        simple && simpleStyles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, simple && simpleStyles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 412, width: '100%' },
    readRow: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 4 },
    content: { gap: 20, paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
    section: { gap: 10 },
    sectionTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    sectionHint: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 14 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    chipTextSelected: { color: '#FFFFFF' },
    discomfort: { gap: 8 },
    discomfortTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.textPrimary, fontSize: 16, height: 52, paddingHorizontal: 16 },
    helper: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    notice: { alignItems: 'flex-start', backgroundColor: colors.warningLight, borderRadius: 16, flexDirection: 'row', gap: 8, padding: 16 },
    noticeCopy: { flex: 1, gap: 2 },
    noticeTitle: { color: colors.warning, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    noticeText: { color: colors.textBody, fontSize: 14, lineHeight: 21 },
    footer: { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 8 },
    button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center' },
    buttonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    pressed: { opacity: 0.75 },
  } as const;
}

const simpleStyles = StyleSheet.create({
  content: { gap: 28 },
  sectionTitle: {},
  chip: { borderRadius: 12, minHeight: 48, paddingHorizontal: 18 },
  chipText: {},
  input: { height: 54 },
  button: { height: 60 },
});
