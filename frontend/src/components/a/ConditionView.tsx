import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/ui/check.svg';
import HouseIcon from '@/assets/icons/ui/house.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
import { Text, TextInput } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { Headline } from '@/src/components/b/Headline';
import {
  exerciseEquipmentLabels,
  exerciseLocationLabels,
  type ExerciseCondition,
  type ExerciseEquipment,
  type ExerciseLocation,
} from '@/src/features/exercise/exerciseData';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's "what is today like" before a routine is made (11/26, the 지금 | 바꾼다면 picture): the headline
// says what the four answers are for, the four questions sit in the black card like the home's proposals
// (a lilac tick once answered, lilac chips for the answer), where it hurts and the care line in a white
// card, and the button right under them. A view that only shows what it is given;
// app/exercise/condition.tsx keeps what it asks the server.
const TIMES = [30, 45, 60, 90, 120];
const PLACES: ExerciseLocation[] = ['gym', 'home', 'outdoor', 'other'];
const TOOLS: ExerciseEquipment[] = ['bodyweight', 'band', 'dumbbell', 'machine', 'other'];
const FEELS = ['좋음', '보통', '피곤해요', '안 좋아요'];

export interface ConditionViewProps {
  value: ExerciseCondition;
  busy: boolean;
  error: string;
  onChange: (next: ExerciseCondition) => void;
  onGo: () => void;
  onBack: () => void;
  onHome: () => void;
}

export function ConditionView({ value, busy, error, onChange, onGo, onBack, onHome }: ConditionViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const chip = (label: string, selected: boolean, onPress: () => void, many = false) => (
    <Pressable
      accessibilityLabel={label.replace('+', ' 이상')}
      accessibilityRole={many ? 'checkbox' : 'radio'}
      accessibilityState={many ? { checked: selected } : { selected }}
      key={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.on, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected && styles.onText]}>{label}</Text>
    </Pressable>
  );
  const ask = (title: string, answered: boolean, chips: ReactNode, hint?: string) => (
    <View style={[styles.ask, title !== '운동할 수 있는 시간' && styles.askLine]}>
      <View style={styles.askHead}>
        <View style={[styles.tick, answered ? styles.tickOn : styles.tickOff]}>
          {answered ? <CheckIcon color={colors.lilacInk} height={14} width={14} /> : null}
        </View>
        <Text style={styles.q}>
          {title}
          {hint ? <Text style={styles.hint}>  {hint}</Text> : null}
        </Text>
      </View>
      {/* one row a question, every answer the same width: no answer falls alone to a second row */}
      <View style={styles.chips}>{chips}</View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScreenHeader
        onBack={onBack}
        right={
          <Pressable accessibilityLabel="홈으로 가기" accessibilityRole="button" hitSlop={12} onPress={onHome}>
            <HouseIcon color={colors.textPrimary} height={24} width={24} />
          </Pressable>
        }
        title="오늘의 운동 설정"
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Headline lines={[[{ text: '네 가지만 고르면' }], [{ text: '맞춤 운동', mark: true }, { text: '을 짜 드려요' }]]} />

        <View style={styles.ai}>
          {ask('운동할 수 있는 시간', value.availableMinutes !== null, TIMES.map((minutes) => chip(minutes === 120 ? '120분+' : `${minutes}분`, value.availableMinutes === minutes, () => onChange({ ...value, availableMinutes: minutes }))))}
          {ask('어디서 하나요?', value.location !== null, PLACES.map((place) => chip(exerciseLocationLabels[place], value.location === place, () => onChange({ ...value, location: place }))))}
          {ask(
            '쓸 수 있는 기구',
            value.equipment.length > 0,
            TOOLS.map((tool) => chip(
              exerciseEquipmentLabels[tool],
              value.equipment.includes(tool),
              () => onChange({ ...value, equipment: value.equipment.includes(tool) ? value.equipment.filter((item) => item !== tool) : [...value.equipment, tool] }),
              true,
            )),
            '여러 개 고를 수 있어요',
          )}
          {ask('오늘 컨디션', Boolean(value.condition), FEELS.map((feel) => chip(feel, value.condition === feel, () => onChange({ ...value, condition: feel }))))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            불편한 곳<Text style={styles.small}>  선택</Text>
          </Text>
          <TextInput
            accessibilityLabel="불편한 부위"
            maxLength={50}
            onChangeText={(text) => onChange({ ...value, discomfortArea: text })}
            placeholder="예) 오른쪽 무릎, 허리"
            placeholderTextColor={colors.textSecondary}
            style={styles.field}
            value={value.discomfortArea}
          />
          <Text style={styles.small}>적어 주시면 그 부위는 피해서 추천해요.</Text>
          <View style={styles.care}>
            <WarningIcon color={colors.textSecondary} height={16} width={16} />
            <Text style={styles.careText}>통증이 심하면 운동을 멈추고 전문가와 상담해 주세요.</Text>
          </View>
        </View>

        {error ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onGo}
          style={({ pressed }) => [styles.go, busy && styles.goOff, pressed && styles.pressed]}
        >
          <Text style={[styles.goText, busy && styles.offText]}>{busy ? '만드는 중…' : '맞춤 운동 만들기'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 16, paddingHorizontal: 24, paddingTop: 8 },
    pressed: { opacity: 0.75 },

    // the four questions in the black card (the home's proposals and 내 정보's ticks)
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, paddingBottom: 18, paddingHorizontal: 20, paddingTop: 16 },
    ask: { gap: 10, paddingVertical: 12 },
    askLine: { borderTopColor: colors.aiLine, borderTopWidth: 1 },
    askHead: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    tick: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
    tickOn: { backgroundColor: colors.lilac },
    tickOff: { borderColor: colors.aiRing, borderWidth: 1.5 },
    q: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    hint: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardRegular, fontSize: 12.5 },
    chips: { flexDirection: 'row', gap: 6 },
    chip: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, flex: 1, height: 38, justifyContent: 'center', paddingHorizontal: 4 },
    chipText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    on: { backgroundColor: colors.lilac },
    onText: { color: colors.lilacInk },

    // where it hurts, with the care line
    card: { backgroundColor: colors.surface, borderRadius: 28, gap: 10, paddingBottom: 20, paddingHorizontal: 22, paddingTop: 18 },
    label: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    small: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 12.5, lineHeight: 18 },
    field: { backgroundColor: colors.surfaceMuted, borderRadius: 14, color: colors.textPrimary, fontSize: 15, height: 48, paddingHorizontal: 16 },
    care: { alignItems: 'flex-start', flexDirection: 'row', gap: 6 },
    careText: { color: colors.textBody, flex: 1, fontSize: 12.5, lineHeight: 18 },
    error: { color: colors.danger, fontSize: 13, lineHeight: 19 },

    go: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 56, justifyContent: 'center' },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
    offText: { color: colors.textDisabled },
  } as const;
}
