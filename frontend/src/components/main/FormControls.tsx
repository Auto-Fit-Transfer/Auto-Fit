import { StyleSheet, View, type TextInputProps } from 'react-native';
import { colors, fontFamilies } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';
export function FormField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={form.label}>{label}</Text>
      <TextInput accessibilityLabel={label} {...props} style={[form.input, props.style]} />
    </View>
  );
}
export const form = StyleSheet.create({
  label: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  success: { color: colors.primary, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.surface, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  selected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
});
