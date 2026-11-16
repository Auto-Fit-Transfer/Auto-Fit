// Colors from the redesign Figma file (variable collection "Auto-Fit UI", Light and Dark modes).
export interface TierColors {
  bg: string;
  fg: string;
}

export interface Palette {
  primary: string;
  primaryPressed: string;
  primaryLight: string;
  primaryText: string;
  onPrimary: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  elevated: string;
  border: string;
  textPrimary: string;
  textBody: string;
  textSecondary: string;
  textDisabled: string;
  tabBar: string;
  tabBarBorder: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  gaugeFill: string;
  gaugeTrack: string;
  overlay: string;
  transparent: string;
  tier: Record<'CORE' | 'BALANCE' | 'ACTIVE' | 'FIT' | 'PEAK', TierColors>;
  // Renewal A (the pixel game). ink: the one dark outline every piece has. gold: points you got.
  // track: the empty part of a bar, and quiet dividers.
  ink: string;
  gold: string;
  track: string;
}

export const lightPalette: Palette = {
  // Renewal A: violet is what you press and how far you are; the letters on it are dark, not white.
  primary: '#9D8BFF',
  primaryPressed: '#8A77F0',
  primaryLight: '#ECE8FF',
  primaryText: '#4A36B8',
  onPrimary: '#1B1247',
  background: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F7',
  elevated: '#FFFFFF',
  border: '#D5D9E6',
  textPrimary: '#20233F',
  textBody: '#2C3050',
  textSecondary: '#6E7389',
  textDisabled: '#9AA0B4',
  tabBar: '#20233F',
  tabBarBorder: '#20233F',
  success: '#0E7C48',
  successLight: '#E8F6EF',
  warning: '#9A5B00',
  warningLight: '#FFF3E0',
  danger: '#E0503A',
  dangerLight: '#FDECE8',
  gaugeFill: '#9D8BFF',
  gaugeTrack: '#E4E7F0',
  overlay: 'rgba(13, 13, 20, 0.45)',
  transparent: 'transparent',
  tier: {
    CORE: { bg: '#EEF4EA', fg: '#46623A' },
    BALANCE: { bg: '#E5F4F7', fg: '#14606F' },
    ACTIVE: { bg: '#FCEFE5', fg: '#94481A' },
    FIT: { bg: '#ECE9FF', fg: '#43389F' },
    PEAK: { bg: '#FAF2DD', fg: '#6E5210' },
  },
  ink: '#20233F',
  gold: '#FFD23F',
  track: '#E4E7F0',
};

export const darkPalette: Palette = {
  primary: '#6A5CF0',
  primaryPressed: '#5546D9',
  primaryLight: '#2A2652',
  primaryText: '#A99FFF',
  onPrimary: '#FFFFFF',
  background: '#111214',
  surface: '#1A1C1F',
  surfaceMuted: '#25282C',
  elevated: '#2A2D33',
  border: '#363A41',
  textPrimary: '#F3F4F6',
  textBody: '#D5D7DC',
  textSecondary: '#A3A7AF',
  textDisabled: '#70747C',
  tabBar: '#23262B',
  tabBarBorder: '#3A3E46',
  success: '#45C086',
  successLight: '#13291E',
  warning: '#F2A54A',
  warningLight: '#2E2210',
  danger: '#FF6B61',
  dangerLight: '#331816',
  gaugeFill: '#6A5CF0',
  gaugeTrack: '#3A3F47',
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
  tier: {
    CORE: { bg: '#1F2A1C', fg: '#A9CC98' },
    BALANCE: { bg: '#13282E', fg: '#7FCBDD' },
    ACTIVE: { bg: '#33220F', fg: '#F2AE7E' },
    FIT: { bg: '#23204A', fg: '#B4ABFF' },
    PEAK: { bg: '#2F2710', fg: '#E8C766' },
  },
  // Renewal A has no dark look (decided); these only keep the type whole.
  ink: '#F3F4F6',
  gold: '#FFD23F',
  track: '#3A3F47',
};
