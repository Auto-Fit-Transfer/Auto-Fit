import type { ReactNode, Ref } from 'react';
import { Pressable, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';

import CheckIcon from '@/assets/icons/ui/check.svg';
import { Text, TextInput } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's questions in the black card (the home's proposals, 오늘의 운동 설정): each question a row with a
// tick that turns lilac once answered, its answer under it as dark chips (lilac when chosen) or a dark field.
// Used by the sign-up steps a social login goes through (11/27, the 지금 | 바꾼다면 picture).
export function AskCard({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.card}>{children}</View>;
}

export function AskRow({ title, hint, answered, first = false, children }: { title: string; hint?: string; answered: boolean; first?: boolean; children: ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.row, !first && styles.rowLine]}>
      <View style={styles.head}>
        <View style={[styles.tick, answered ? styles.tickOn : styles.tickOff]}>
          {answered ? <CheckIcon color={colors.lilacInk} height={14} width={14} /> : null}
        </View>
        <Text style={styles.title}>
          {title}
          {hint ? <Text style={styles.hint}>  {hint}</Text> : null}
        </Text>
      </View>
      <View style={styles.answer}>{children}</View>
    </View>
  );
}

export function AskChip({ label, selected, onPress, many = false, style }: { label: string; selected: boolean; onPress: () => void; many?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole={many ? 'checkbox' : 'radio'}
      accessibilityState={many ? { checked: selected } : { selected }}
      hitSlop={{ bottom: 3, top: 3 }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, style, selected && styles.chipOn, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function AskField({
  inputRef, unit, accessibilityLabel, value, onChangeText, placeholder, keyboardType, maxLength, onFocus, onBlur,
}: {
  inputRef?: Ref<TextInput>;
  unit?: string;
  accessibilityLabel: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.field}>
      <TextInput
        ref={inputRef}
        accessibilityLabel={accessibilityLabel}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.onAiMuted}
        returnKeyType="done"
        style={styles.input}
        value={value}
      />
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

// A dark field that opens a picker (the birthday)
export function AskSelect({ label, value, placeholder, onPress }: { label: string; value: string | null; placeholder: string; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
      <Text style={[styles.input, !value && styles.placeholder]}>{value ?? placeholder}</Text>
    </Pressable>
  );
}

export function AskNote({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.note}>{children}</Text>;
}

function createStyles({ colors }: AppTheme) {
  return {
    card: { backgroundColor: colors.aiCard, borderRadius: 28, paddingBottom: 18, paddingHorizontal: 20, paddingTop: 16 },
    row: { gap: 10, paddingVertical: 12 },
    rowLine: { borderTopColor: colors.aiLine, borderTopWidth: 1 },
    head: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    tick: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
    tickOn: { backgroundColor: colors.lilac },
    tickOff: { borderColor: colors.aiRing, borderWidth: 1.5 },
    title: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    hint: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardRegular, fontSize: 12.5 },
    // the answer starts under the question's name, past the tick
    answer: { gap: 6, paddingLeft: 32 },
    chip: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, height: 38, justifyContent: 'center', paddingHorizontal: 6 },
    chipOn: { backgroundColor: colors.lilac },
    chipText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    chipTextOn: { color: colors.lilacInk },
    pressed: { opacity: 0.75 },
    field: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 14, flexDirection: 'row', gap: 8, height: 46, paddingHorizontal: 16 },
    input: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardRegular, fontSize: 15, minWidth: 0, padding: 0 },
    placeholder: { color: colors.onAiMuted },
    unit: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardMedium, fontSize: 13 },
    note: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardRegular, fontSize: 12.5, lineHeight: 18 },
  } as const;
}
