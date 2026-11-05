import { createContext, createElement, forwardRef, useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, Text as NativeText, type TextProps } from 'react-native';

import { keepKoreanWords } from '@/src/lib/koreanLineBreak';
import { fontFamilies, scaleText, useAppTheme } from '@/src/theme';

// Use this instead of the react-native Text: Korean then wraps at spaces, never mid-word.
// iOS does it natively; Android and the web get word joiners inside each Korean word.
const joinWords = Platform.OS !== 'ios';

const InsideText = createContext(false);

// Neighbouring strings and numbers render as one run of text, so they are joined first.
function keepWords(children: ReactNode): ReactNode[] {
  const items: ReactNode[] = Array.isArray(children) ? children.flat(Infinity) : [children];
  const result: ReactNode[] = [];
  let run = '';
  for (const item of items) {
    if (typeof item === 'string' || typeof item === 'number') {
      run += item;
      continue;
    }
    if (run) result.push(keepKoreanWords(run));
    run = '';
    result.push(item);
  }
  if (run) result.push(keepKoreanWords(run));
  return result;
}

export const Text = forwardRef<NativeText, TextProps>(function Text(
  { children, style, ...props },
  ref,
) {
  const { colors, easyMode, fontStep } = useAppTheme();
  const nested = useContext(InsideText);
  const flat = StyleSheet.flatten(style) ?? {};
  // Without these, text shows the device font and stays black on dark screens. Nested text inherits
  // both from its parent, so only the outermost text takes them.
  const base = nested ? flat : {
    ...flat,
    color: flat.color ?? colors.textPrimary,
    fontFamily: flat.fontFamily ?? fontFamilies.pretendardRegular,
  };
  // The easy (senior) mode and the font size setting resize every text here.
  const textStyle = scaleText(base, easyMode, fontStep);
  const textProps = {
    lineBreakStrategyIOS: 'hangul-word' as const,
    ...props,
    style: textStyle,
    ref,
  };
  // Passed as separate arguments so React treats them like children written inline.
  const inner = joinWords ? keepWords(children) : [children];
  if (nested) return createElement(NativeText, textProps, ...inner);
  return createElement(NativeText, textProps, createElement(InsideText.Provider, { value: true }, ...inner));
});
