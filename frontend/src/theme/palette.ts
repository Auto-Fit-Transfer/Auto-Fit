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
  // Renewal B. lilac: only where the AI is at work. now: today, or what is new.
  // ai*: the black card, the app's own voice (what it did for me). navBar: the light tab bar.
  lilac: string;
  lilacInk: string;
  now: string;
  aiCard: string;
  aiRaised: string;
  aiLine: string;
  aiBar: string;
  aiBorder: string;
  aiHello: string;
  aiRing: string;
  onAi: string;
  onAiMuted: string;
  navBar: string;
  navBarBorder: string;
  // Renewal A pieces still on some screens until each gets its B look: ink outline, gold points, track.
  ink: string;
  gold: string;
  track: string;
}

export const lightPalette: Palette = {
  // Renewal B: black is the main action (it was purple), the page is light grey and the cards white.
  primary: '#010101',
  primaryPressed: '#2B2A33',
  primaryLight: '#ECE6FD',
  primaryText: '#010101',
  onPrimary: '#FFFFFF',
  background: '#F4F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#EEEFF5',
  elevated: '#FFFFFF',
  border: '#E3E4EA',
  textPrimary: '#010101',
  textBody: '#26262C',
  textSecondary: '#6A6B76',
  textDisabled: '#8E8D95',
  // Still the dark fill older screens use (progress, toast, my chat bubble); the tab bar itself reads navBar.
  tabBar: '#010101',
  tabBarBorder: '#010101',
  success: '#0E7C48',
  successLight: '#E8F6EF',
  warning: '#9A5B00',
  warningLight: '#FFF3E0',
  danger: '#C62828',
  dangerLight: '#FDECEC',
  gaugeFill: '#010101',
  gaugeTrack: '#EEEFF5',
  overlay: 'rgba(13, 13, 20, 0.45)',
  transparent: 'transparent',
  tier: {
    CORE: { bg: '#EEF4EA', fg: '#46623A' },
    BALANCE: { bg: '#E5F4F7', fg: '#14606F' },
    ACTIVE: { bg: '#FCEFE5', fg: '#94481A' },
    FIT: { bg: '#ECE9FF', fg: '#43389F' },
    PEAK: { bg: '#FAF2DD', fg: '#6E5210' },
  },
  lilac: '#C8B6F5',
  lilacInk: '#33268A',
  now: '#7B5CF0',
  aiCard: '#010101',
  aiRaised: '#24232B',
  aiLine: 'rgba(255, 255, 255, 0.14)',
  aiBar: '#1E1D24',
  aiBorder: 'transparent',
  aiHello: '#C8B6F5',
  aiRing: 'rgba(255, 255, 255, 0.3)',
  onAi: '#FFFFFF',
  onAiMuted: '#C9C8D3',
  navBar: '#FFFFFF',
  navBarBorder: '#E3E4EA',
  ink: '#010101',
  gold: '#FFD23F',
  track: '#EEEFF5',
};

export const darkPalette: Palette = {
  // Renewal B, dark: the page is the darkest, cards are one step lighter so they read as boxes,
  // white is the main action (black was), and the AI card turns white (the user's choice, shown
  // against a tinted and a beige one): a black card would vanish on a dark page.
  primary: '#FFFFFF',
  primaryPressed: '#DADBE2',
  primaryLight: '#2A2640',
  primaryText: '#FFFFFF',
  onPrimary: '#010101',
  background: '#0E0E12',
  surface: '#1C1C23',
  surfaceMuted: '#292932',
  elevated: '#23232B',
  border: '#31313C',
  textPrimary: '#F4F5F9',
  textBody: '#DCDDE4',
  textSecondary: '#A0A1AD',
  textDisabled: '#70717D',
  tabBar: '#2E2E38',
  tabBarBorder: '#3A3A46',
  success: '#45C086',
  successLight: '#13291E',
  warning: '#F2A54A',
  warningLight: '#2E2210',
  danger: '#FF6B61',
  dangerLight: '#331816',
  gaugeFill: '#F4F5F9',
  gaugeTrack: '#31313C',
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
  tier: {
    CORE: { bg: '#1F2A1C', fg: '#A9CC98' },
    BALANCE: { bg: '#13282E', fg: '#7FCBDD' },
    ACTIVE: { bg: '#33220F', fg: '#F2AE7E' },
    FIT: { bg: '#23204A', fg: '#B4ABFF' },
    PEAK: { bg: '#2F2710', fg: '#E8C766' },
  },
  lilac: '#C8B6F5',
  lilacInk: '#C8B6F5',
  now: '#9D8BFF',
  aiCard: '#F4F5F9',
  aiRaised: '#E3E4EA',
  aiLine: 'rgba(1, 1, 1, 0.1)',
  aiBar: '#FFFFFF',
  aiBorder: 'transparent',
  aiHello: '#5B43C9',
  aiRing: 'rgba(1, 1, 1, 0.12)',
  onAi: '#010101',
  onAiMuted: '#6A6B76',
  navBar: '#15151A',
  navBarBorder: '#2A2A33',
  // Renewal A has no dark look (decided); these only keep the type whole.
  ink: '#F3F4F6',
  gold: '#FFD23F',
  track: '#3A3F47',
};
