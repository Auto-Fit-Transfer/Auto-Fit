import { createElement, forwardRef, type ReactNode } from 'react';
import { Platform, StyleSheet, Text as NativeText, type TextProps } from 'react-native';

import { keepKoreanWords } from '@/src/lib/koreanLineBreak';
import { scaleForEasyMode, useAppTheme } from '@/src/theme';

// Use this instead of the react-native Text: Korean then wraps at spaces, never mid-word.
// iOS does it natively; Android and the web get word joiners inside each Korean word.
const joinWords = Platform.OS !== 'ios';

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
  const { easyMode } = useAppTheme();
  // The easy (senior) mode enlarges every text by the same steps as the Figma "Easy" styles.
  const textStyle = easyMode ? scaleForEasyMode(StyleSheet.flatten(style) ?? {}) : style;
  const textProps = {
    lineBreakStrategyIOS: 'hangul-word' as const,
    ...props,
    style: textStyle,
    ref,
  };
  // Passed as separate arguments so React treats them like children written inline.
  if (joinWords) return createElement(NativeText, textProps, ...keepWords(children));
  return <NativeText {...textProps}>{children}</NativeText>;
});
