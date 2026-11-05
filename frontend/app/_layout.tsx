import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { NavigationBar as ExpoNavigationBar } from 'expo-navigation-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGate } from '@/src/features/auth/AuthGate';
import { ExerciseRoutineProvider } from '@/src/features/exercise/ExerciseRoutineContext';
import { ExerciseSessionProvider } from '@/src/features/exercise/ExerciseSessionContext';
import { DisplayPreferencesProvider, useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { AppThemeProvider, darkPalette, fontAssets, lightPalette } from '@/src/theme';

void SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { isDark } = useDisplayPreferences();
  const background = (isDark ? darkPalette : lightPalette).background;
  const base = isDark ? DarkTheme : DefaultTheme;
  return <AppThemeProvider>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    {Platform.OS === 'android' ? <ExpoNavigationBar hidden /> : null}
    <ExerciseRoutineProvider>
      <ExerciseSessionProvider>
        {/* Nested stacks and tabs paint this behind their screens, so a light default would flash in dark mode. */}
        <ThemeProvider value={{ ...base, colors: { ...base.colors, background } }}>
          <Stack screenOptions={{ contentStyle: { backgroundColor: background }, headerShown: false }} />
          <AuthGate background={background} />
        </ThemeProvider>
      </ExerciseSessionProvider>
    </ExerciseRoutineProvider>
  </AppThemeProvider>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <DisplayPreferencesProvider><AppShell /></DisplayPreferencesProvider>
    </SafeAreaProvider>
  );
}
