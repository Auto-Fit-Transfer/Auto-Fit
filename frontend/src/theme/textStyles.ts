import type { TextStyle } from 'react-native';

import { fontFamilies } from './fonts';

// Text styles from the redesign Figma file ("Simple/*"). The shared Text turns them into the
// "Easy/*" sizes when the easy mode is on.
const weights = {
  regular: fontFamilies.pretendardRegular,
  medium: fontFamilies.pretendardMedium,
  bold: fontFamilies.pretendardBold,
} as const;

const specs = {
  display: [32, 'bold', 1.25],
  title1: [22, 'bold', 1.35],
  title2: [18, 'bold', 1.4],
  body1: [16, 'regular', 1.5],
  body1Strong: [16, 'bold', 1.5],
  body2: [14, 'regular', 1.5],
  body2Strong: [14, 'medium', 1.5],
  caption: [12, 'regular', 1.4],
  captionStrong: [12, 'medium', 1.4],
  button: [16, 'bold', 1.4],
  tab: [12, 'medium', 1.3],
  tabActive: [12, 'bold', 1.3],
} as const satisfies Record<string, readonly [number, keyof typeof weights, number]>;

export type TextStyleName = keyof typeof specs;
export type TextStyles = Record<TextStyleName, TextStyle>;

function build(): TextStyles {
  const styles = {} as TextStyles;
  for (const name of Object.keys(specs) as TextStyleName[]) {
    const [fontSize, weight, lineHeight] = specs[name];
    styles[name] = {
      fontFamily: weights[weight],
      fontSize,
      letterSpacing: Math.round(fontSize * -0.015 * 100) / 100,
      lineHeight: Math.round(fontSize * lineHeight),
    };
  }
  return styles;
}

export const textStyles = build();
