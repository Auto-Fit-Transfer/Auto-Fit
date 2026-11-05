import { forwardRef } from 'react';
import { StyleSheet, TextInput as NativeTextInput, type TextInputProps } from 'react-native';

import { fontFamilies, useAppTheme } from '@/src/theme';

// Use this instead of the react-native TextInput: without it, input text shows the device font and
// stays black on dark screens.
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput(
  { placeholderTextColor, style, ...props },
  ref,
) {
  const { colors } = useAppTheme();
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <NativeTextInput
      {...props}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      ref={ref}
      style={{
        ...flat,
        color: flat.color ?? colors.textPrimary,
        fontFamily: flat.fontFamily ?? fontFamilies.pretendardRegular,
      }}
    />
  );
});
// The same name as a type too, so existing useRef<TextInput> calls keep working.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type TextInput = NativeTextInput;
