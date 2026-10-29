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
import { AppThemeProvider, fontAssets, useAppTheme } from '@/src/theme';

void SplashScreen.preventAutoHideAsync();

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
      <AppThemeProvider>
        <ThemedStatusBar />
        {Platform.OS === 'android' ? <ExpoNavigationBar hidden /> : null}
        <ExerciseRoutineProvider>
          <ExerciseSessionProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </ExerciseSessionProvider>
        </ExerciseRoutineProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const { isDark } = useAppTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
