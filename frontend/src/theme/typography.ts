import type { TextStyle } from 'react-native';

import { fontFamilies } from './fonts';

type TypographyToken = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

export const typography = {
  display: {
    fontFamily: fontFamilies.gmarketMedium,
    fontSize: 40,
    lineHeight: 50,
    letterSpacing: 2,
  },
  heading: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 32,
    lineHeight: 40,
  },
  body: {
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 22,
  },
  title: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 18,
    lineHeight: 26,
  },
  sectionTitle: {
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyEmphasis: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  caption: {
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 16,
    lineHeight: 22,
  },
} satisfies Record<string, TypographyToken>;
