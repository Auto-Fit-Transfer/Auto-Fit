import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import AutofitWordmarkDark from '@/assets/icons/autofit-wordmark-dark.svg';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { startDestination } from '@/src/features/auth/startDestination';
import { getSupabaseClient } from '@/src/lib/supabase';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const splashDuration = 3000;

export default function SplashScreen() {
  const { isDark } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const Wordmark = isDark ? AutofitWordmarkDark : AutofitWordmark;

  useEffect(() => {
    let active = true;
    const shown = new Promise((resolve) => setTimeout(resolve, splashDuration));
    void Promise.all([
      startDestination(() => getSupabaseClient().auth.getSession(), getPostLoginDestination),
      shown,
    ]).then(([destination]) => {
      if (active) router.replace(destination);
    });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={styles.root}>
      <Wordmark accessibilityLabel="autofit" height={41} width={151} />
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: {
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: colors.surface,
      flex: 1,
      justifyContent: 'center',
      maxWidth: 412,
      width: '100%',
    },
  } as const;
}
