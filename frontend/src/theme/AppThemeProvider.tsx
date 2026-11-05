import { createContext, useCallback, useContext, useMemo, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';

import { darkPalette, lightPalette, type Palette } from './palette';
import { textStyles, type TextStyles } from './textStyles';

export type ColorModePreference = 'system' | 'light' | 'dark';

export interface DisplaySettings {
  colorMode: ColorModePreference;
  easyMode: boolean;
}

export interface AppTheme {
  colors: Palette;
  // Base sizes; the shared Text resizes them for the easy mode and the font size setting.
  text: TextStyles;
  isDark: boolean;
  easyMode: boolean;
  fontStep: number;
}

interface AppThemeContextValue extends AppTheme {
  settings: DisplaySettings;
  updateSettings: (patch: Partial<DisplaySettings>) => void;
}

const defaultSettings: DisplaySettings = { colorMode: 'light', easyMode: false };

// Four fixed theme objects, so styles built from a theme are only rebuilt when it really changes.
const themes = {
  light: { colors: lightPalette, text: textStyles, isDark: false, easyMode: false, fontStep: 3 },
  lightEasy: { colors: lightPalette, text: textStyles, isDark: false, easyMode: true, fontStep: 3 },
  dark: { colors: darkPalette, text: textStyles, isDark: true, easyMode: false, fontStep: 3 },
  darkEasy: { colors: darkPalette, text: textStyles, isDark: true, easyMode: true, fontStep: 3 },
} satisfies Record<string, AppTheme>;

function pickTheme(isDark: boolean, easyMode: boolean): AppTheme {
  if (isDark) return easyMode ? themes.darkEasy : themes.dark;
  return easyMode ? themes.lightEasy : themes.light;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  ...themes.light,
  settings: defaultSettings,
  updateSettings: () => {},
});

// Wraps the whole app in app/_layout.tsx, so every screen follows the saved display settings.
export function AppThemeProvider({ children }: PropsWithChildren) {
  const { preferences, isDark, save } = useDisplayPreferences();
  const easyMode = preferences.simple_mode_enabled;
  const colorMode = preferences.theme_mode;
  const settings = useMemo(() => ({ colorMode, easyMode }), [colorMode, easyMode]);

  const updateSettings = useCallback(
    (patch: Partial<DisplaySettings>) => {
      save({
        ...preferences,
        theme_mode: patch.colorMode ?? colorMode,
        simple_mode_enabled: patch.easyMode ?? easyMode,
      }).catch(() => {});
    },
    [colorMode, easyMode, preferences, save],
  );

  const theme = pickTheme(isDark, easyMode);
  const fontStep = preferences.font_size_step;
  const value = useMemo(
    () => ({ ...theme, fontStep, settings, updateSettings }),
    [theme, fontStep, settings, updateSettings],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  return useContext(AppThemeContext);
}

// Builds a style sheet from the current theme; pass a function defined outside the component.
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  create: (theme: AppTheme) => T,
): T {
  const { colors, text, isDark, easyMode, fontStep } = useAppTheme();
  return useMemo(
    () => StyleSheet.create(create({ colors, text, isDark, easyMode, fontStep })),
    [create, colors, text, isDark, easyMode, fontStep],
  );
}
