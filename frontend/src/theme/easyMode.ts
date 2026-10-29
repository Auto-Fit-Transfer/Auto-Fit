import type { TextStyle } from 'react-native';

// The easy (senior) mode shows text at about 1.25x, the same steps as the Figma "Easy" text styles.
const EASY_FONT_SIZES: Record<number, number> = {
  11: 14,
  12: 16,
  13: 17,
  14: 18,
  15: 19,
  16: 20,
  17: 21,
  18: 22,
  19: 23,
  20: 24,
  22: 26,
  24: 28,
  26: 30,
  28: 32,
  32: 36,
};

export function toEasyFontSize(size: number): number {
  return EASY_FONT_SIZES[size] ?? Math.round(size * (size < 11 ? 1.25 : 1.15));
}

// Line height and letter spacing grow in proportion to the font size.
// Text without its own font size inherits from its parent, so it is left alone.
export function scaleForEasyMode(style: TextStyle): TextStyle {
  const size = style.fontSize;
  if (typeof size !== 'number' || size <= 0) return style;
  const next = toEasyFontSize(size);
  const ratio = next / size;
  const scaled: TextStyle = { ...style, fontSize: next };
  if (typeof style.lineHeight === 'number')
    scaled.lineHeight = Math.round(style.lineHeight * ratio);
  if (typeof style.letterSpacing === 'number') {
    scaled.letterSpacing = Math.round(style.letterSpacing * ratio * 100) / 100;
  }
  return scaled;
}
