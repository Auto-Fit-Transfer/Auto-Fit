import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';

const splashDuration = 3000;

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/login'), splashDuration);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AutofitWordmark accessibilityLabel="autofit" height={43} width={160} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F9FAFB',
    flex: 1,
    justifyContent: 'center',
    maxWidth: 412,
    width: '100%',
  },
});
