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
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { fontFamilies } from '@/src/theme';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const { source, discomfortArea } = useLocalSearchParams<{ source?: string; discomfortArea?: string }>();
  const { condition: savedCondition, generateRoutine } = useExerciseRoutine();
  const isChanging = source === 'summary';
  const [condition, setCondition] = useState<ExerciseCondition>(() =>
    isChanging
      ? { ...savedCondition, equipment: [...savedCondition.equipment] }
      : { ...initialExerciseCondition, equipment: [], discomfortArea: discomfortArea?.slice(0, 50) ?? '' },
  );
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
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 5 }]}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.back}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 운동 설정</Text>
        <View style={styles.headerSpacer} />
      </View>
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
        <ChoiceSection title="어디서 하나요?" hint="운동 장소">
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
          <Text style={styles.sectionTitle}>
            불편한 곳 <Text style={styles.sectionHint}>(선택)</Text>
          </Text>
          <TextInput
            accessibilityLabel="불편한 부위"
            maxLength={50}
            onChangeText={(value) =>
              setCondition((current) => ({ ...current, discomfortArea: value }))
            }
            placeholder="예) 오른쪽 무릎, 허리"
            placeholderTextColor="#A1A1A9"
            style={[styles.input, simple && simpleStyles.input]}
            value={condition.discomfortArea}
          />
          <Text style={styles.helper}>적어 주시면 그 부위는 피해서 추천해요.</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeIcon}>ⓘ</Text>
          <Text style={styles.noticeText}>통증이 심하면 운동을 멈추고 전문가와 상담해 주세요.</Text>
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

const styles = StyleSheet.create({
  root: { alignSelf: 'center', backgroundColor: '#FFFFFF', flex: 1, maxWidth: 412, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 19 },
  readRow: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 4 },
  back: { height: 44, justifyContent: 'center', width: 38 },
  backText: { color: '#222227', fontSize: 31, lineHeight: 36 },
  headerTitle: {
    color: '#222227',
    flex: 1,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  headerSpacer: { width: 38 },
  content: { gap: 22, paddingBottom: 25, paddingHorizontal: 20, paddingTop: 27 },
  section: { gap: 12 },
  sectionTitle: { color: '#222227', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15 },
  sectionHint: { color: '#9999A1', fontFamily: fontFamilies.pretendardRegular, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    alignItems: 'center',
    backgroundColor: '#FAFAFB',
    borderColor: '#E6E6ED',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 35,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: '#503DD7', borderColor: '#503DD7' },
  chipText: { color: '#66666F', fontSize: 12 },
  chipTextSelected: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold },
  discomfort: { gap: 9 },
  input: {
    backgroundColor: '#F9F9FB',
    borderColor: '#E6E6ED',
    borderRadius: 8,
    borderWidth: 1,
    color: '#222227',
    fontSize: 13,
    height: 44,
    paddingHorizontal: 12,
  },
  helper: { color: '#9999A1', fontSize: 11 },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF6E8',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 8,
    padding: 13,
  },
  noticeIcon: { color: '#B77E2C', fontSize: 16 },
  noticeText: { color: '#8A704D', flex: 1, fontSize: 11, lineHeight: 16 },
  footer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10 },
  button: {
    alignItems: 'center',
    backgroundColor: '#503DD7',
    borderRadius: 8,
    height: 49,
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  pressed: { opacity: 0.75 },
});

const simpleStyles = StyleSheet.create({
  content: { gap: 28 },
  sectionTitle: { fontSize: 19 },
  chip: { borderRadius: 12, minHeight: 48, paddingHorizontal: 18 },
  chipText: { fontSize: 16 },
  input: { fontSize: 17, height: 54 },
  button: { height: 60 },
});
