import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './palette';
import { textStyles, type TextStyles } from './textStyles';

export type ColorModePreference = 'system' | 'light' | 'dark';

export interface DisplaySettings {
  colorMode: ColorModePreference;
  easyMode: boolean;
}

export interface AppTheme {
  colors: Palette;
  // Base sizes; the shared Text enlarges them in the easy mode.
  text: TextStyles;
  isDark: boolean;
  easyMode: boolean;
}

interface AppThemeContextValue extends AppTheme {
  settings: DisplaySettings;
  updateSettings: (patch: Partial<DisplaySettings>) => void;
}

const STORAGE_KEY = 'autofit.displaySettings';

// Light until every screen reads its colors from the theme; then the default can follow the phone.
const defaultSettings: DisplaySettings = { colorMode: 'light', easyMode: false };

// Four fixed theme objects, so styles built from a theme are only rebuilt when it really changes.
const themes = {
  light: { colors: lightPalette, text: textStyles, isDark: false, easyMode: false },
  lightEasy: { colors: lightPalette, text: textStyles, isDark: false, easyMode: true },
  dark: { colors: darkPalette, text: textStyles, isDark: true, easyMode: false },
  darkEasy: { colors: darkPalette, text: textStyles, isDark: true, easyMode: true },
} satisfies Record<string, AppTheme>;

function pickTheme(isDark: boolean, easyMode: boolean): AppTheme {
  if (isDark) return easyMode ? themes.darkEasy : themes.dark;
  return easyMode ? themes.lightEasy : themes.light;
}

function parseSettings(raw: string | null): DisplaySettings {
  if (!raw) return defaultSettings;
  try {
    const value = JSON.parse(raw) as Partial<DisplaySettings>;
    const colorMode = ['system', 'light', 'dark'].includes(value.colorMode as string)
      ? (value.colorMode as ColorModePreference)
      : defaultSettings.colorMode;
    return { colorMode, easyMode: value.easyMode === true };
  } catch {
    return defaultSettings;
  }
}

const AppThemeContext = createContext<AppThemeContextValue>({
  ...themes.light,
  settings: defaultSettings,
  updateSettings: () => {},
});

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active) setSettings(parseSettings(raw));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<DisplaySettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isDark =
    settings.colorMode === 'dark' || (settings.colorMode === 'system' && systemScheme === 'dark');
  const theme = pickTheme(isDark, settings.easyMode);
  const value = useMemo(
    () => ({ ...theme, settings, updateSettings }),
    [theme, settings, updateSettings],
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
  const { colors, text, isDark, easyMode } = useAppTheme();
  return useMemo(
    () => StyleSheet.create(create({ colors, text, isDark, easyMode })),
    [create, colors, text, isDark, easyMode],
  );
}
