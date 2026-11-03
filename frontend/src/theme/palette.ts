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
}

export const lightPalette: Palette = {
  primary: '#4F3FDE',
  primaryPressed: '#3F31B8',
  primaryLight: '#ECE9FF',
  primaryText: '#4F3FDE',
  onPrimary: '#FFFFFF',
  background: '#FFFFFF',
  surface: '#FAFBFC',
  surfaceMuted: '#F2F4F6',
  elevated: '#FFFFFF',
  border: '#DFE2E7',
  textPrimary: '#17161D',
  textBody: '#3B3A42',
  textSecondary: '#5E5D66',
  textDisabled: '#8E8D95',
  tabBar: '#17161D',
  tabBarBorder: '#17161D',
  success: '#0E7C48',
  successLight: '#E8F6EF',
  warning: '#9A5B00',
  warningLight: '#FFF3E0',
  danger: '#C62828',
  dangerLight: '#FDECEC',
  gaugeFill: '#4F3FDE',
  gaugeTrack: '#E3E6EB',
  overlay: 'rgba(13, 13, 20, 0.45)',
  transparent: 'transparent',
  tier: {
    CORE: { bg: '#EEF4EA', fg: '#46623A' },
    BALANCE: { bg: '#E5F4F7', fg: '#14606F' },
    ACTIVE: { bg: '#FCEFE5', fg: '#94481A' },
    FIT: { bg: '#ECE9FF', fg: '#3A2DB5' },
    PEAK: { bg: '#FAF2DD', fg: '#6E5210' },
  },
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
};
