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
function resized(style: TextStyle, toSize: (size: number) => number): TextStyle {
  const size = style.fontSize;
  if (typeof size !== 'number' || size <= 0) return style;
  const next = toSize(size);
  const ratio = next / size;
  const scaled: TextStyle = { ...style, fontSize: next };
  if (typeof style.lineHeight === 'number')
    scaled.lineHeight = Math.round(style.lineHeight * ratio);
  if (typeof style.letterSpacing === 'number') {
    scaled.letterSpacing = Math.round(style.letterSpacing * ratio * 100) / 100;
  }
  return scaled;
}

export function scaleForEasyMode(style: TextStyle): TextStyle {
  return resized(style, toEasyFontSize);
}

// The font size setting in the display settings. Step 3 is the design's own size.
const FONT_STEP_SCALES: Record<number, number> = { 1: 0.9, 2: 0.95, 3: 1, 4: 1.1, 5: 1.2 };
const SMALLEST_FONT_SIZE = 12;

export function scaleForFontStep(style: TextStyle, step: number): TextStyle {
  const scale = FONT_STEP_SCALES[step] ?? 1;
  if (scale === 1) return style;
  return resized(style, (size) => Math.max(Math.min(size, SMALLEST_FONT_SIZE), Math.round(size * scale)));
}

// The easy mode has its own fixed sizes, so the setting only applies outside it.
export function scaleText(style: TextStyle, easyMode: boolean, fontStep: number): TextStyle {
  return easyMode ? scaleForEasyMode(style) : scaleForFontStep(style, fontStep);
}
