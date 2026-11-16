import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { NavigationBar as ExpoNavigationBar } from 'expo-navigation-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGate } from '@/src/features/auth/AuthGate';
import { ExerciseRoutineProvider } from '@/src/features/exercise/ExerciseRoutineContext';
import { ExerciseSessionProvider } from '@/src/features/exercise/ExerciseSessionContext';
import { DisplayPreferencesProvider, useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { AppThemeProvider, darkPalette, fontAssets, lightPalette } from '@/src/theme';

void SplashScreen.preventAutoHideAsync();

// On the web the window can be far wider than a phone. This is a phone app, so there it keeps a
// phone's width in the middle of the window instead of stretching. Phones are not affected.
const frame = StyleSheet.create({
  outer: { flex: 1 },
  inner: Platform.OS === 'web' ? { alignSelf: 'center', flex: 1, maxWidth: 480, width: '100%' } : { flex: 1 },
});

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
          <View style={[frame.outer, { backgroundColor: '#12101F' }]}>
            <View style={frame.inner}>
              <Stack screenOptions={{ contentStyle: { backgroundColor: background }, headerShown: false }} />
              <AuthGate background={background} />
            </View>
          </View>
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
