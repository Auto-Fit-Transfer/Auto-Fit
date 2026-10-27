import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '@/src/components/common';
import { colors, fontFamilies } from '@/src/theme';
export function FormField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={form.label}>{label}</Text>
      <TextInput accessibilityLabel={label} {...props} style={[form.input, props.style]} />
    </View>
  );
}
export const form = StyleSheet.create({
  label: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 17,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  success: { color: colors.primary, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 15 },
  selected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
});
