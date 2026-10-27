import { createElement, forwardRef, type ReactNode } from 'react';
import { Platform, Text as NativeText, type TextProps } from 'react-native';

import { keepKoreanWords } from '@/src/lib/koreanLineBreak';

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

export const Text = forwardRef<NativeText, TextProps>(function Text({ children, ...props }, ref) {
  const textProps = { lineBreakStrategyIOS: 'hangul-word' as const, ...props, ref };
  // Passed as separate arguments so React treats them like children written inline.
  if (joinWords) return createElement(NativeText, textProps, ...keepWords(children));
  return <NativeText {...textProps}>{children}</NativeText>;
});
