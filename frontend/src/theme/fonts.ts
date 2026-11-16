export const fontFamilies = {
  gmarketMedium: 'GmarketSans-Medium',
  pretendardLight: 'Pretendard-Light',
  pretendardRegular: 'Pretendard-Regular',
  pretendardMedium: 'Pretendard-Medium',
  pretendardSemiBold: 'Pretendard-SemiBold',
  pretendardBold: 'Pretendard-Bold',
  pretendardExtraBold: 'Pretendard-ExtraBold',
  // Renewal A: the pixel letters (Galmuri 2.40.3, SIL Open Font License 1.1). 11 is for small text and big numbers, 14 for body text.
  galmuri11: 'Galmuri11',
  galmuri11Bold: 'Galmuri11-Bold',
  galmuri14: 'Galmuri14',
} as const;

export const fontAssets = {
  [fontFamilies.gmarketMedium]: require('../../assets/fonts/GmarketSansTTFMedium.ttf'),
  [fontFamilies.pretendardLight]: require('../../assets/fonts/Pretendard-Light.otf'),
  [fontFamilies.pretendardRegular]: require('../../assets/fonts/Pretendard-Regular.otf'),
  [fontFamilies.pretendardMedium]: require('../../assets/fonts/Pretendard-Medium.otf'),
  [fontFamilies.pretendardSemiBold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
  [fontFamilies.pretendardBold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  [fontFamilies.pretendardExtraBold]: require('../../assets/fonts/Pretendard-ExtraBold.otf'),
  [fontFamilies.galmuri11]: require('../../assets/fonts/Galmuri11.ttf'),
  [fontFamilies.galmuri11Bold]: require('../../assets/fonts/Galmuri11-Bold.ttf'),
  [fontFamilies.galmuri14]: require('../../assets/fonts/Galmuri14.ttf'),
} as const;
