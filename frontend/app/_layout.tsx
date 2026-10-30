import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { NavigationBar as ExpoNavigationBar } from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExerciseRoutineProvider } from '@/src/features/exercise/ExerciseRoutineContext';
import { ExerciseSessionProvider } from '@/src/features/exercise/ExerciseSessionContext';
import { DisplayPreferencesProvider, useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { fontAssets } from '@/src/theme';

void SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { isDark } = useDisplayPreferences();
  return <>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    {Platform.OS === 'android' ? <ExpoNavigationBar hidden /> : null}
    <ExerciseRoutineProvider>
      <ExerciseSessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ExerciseSessionProvider>
    </ExerciseRoutineProvider>
  </>;
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
