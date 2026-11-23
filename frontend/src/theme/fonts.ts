export const fontFamilies = {
  gmarketMedium: 'GmarketSans-Medium',
  pretendardLight: 'Pretendard-Light',
  pretendardRegular: 'Pretendard-Regular',
  pretendardMedium: 'Pretendard-Medium',
  pretendardSemiBold: 'Pretendard-SemiBold',
  pretendardBold: 'Pretendard-Bold',
  pretendardExtraBold: 'Pretendard-ExtraBold',
  // Renewal B has no pixel letters: the names renewal A's screens use stand for Pretendard here, so a screen
  // not given its B look yet still reads in B's letters (11: small text, 11Bold: big numbers and buttons, 14: body).
  galmuri11: 'Pretendard-Medium',
  galmuri11Bold: 'Pretendard-ExtraBold',
  galmuri14: 'Pretendard-Regular',
} as const;

export const fontAssets = {
  [fontFamilies.gmarketMedium]: require('../../assets/fonts/GmarketSansTTFMedium.ttf'),
  [fontFamilies.pretendardLight]: require('../../assets/fonts/Pretendard-Light.otf'),
  [fontFamilies.pretendardRegular]: require('../../assets/fonts/Pretendard-Regular.otf'),
  [fontFamilies.pretendardMedium]: require('../../assets/fonts/Pretendard-Medium.otf'),
  [fontFamilies.pretendardSemiBold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
  [fontFamilies.pretendardBold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  [fontFamilies.pretendardExtraBold]: require('../../assets/fonts/Pretendard-ExtraBold.otf'),
} as const;
