import { logError } from '@/src/lib/logError';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { callbackSummary, isPasswordRecoveryUrl, isRecoveryAttempt, RESET_ASKED_KEY } from '@/src/features/auth/authCallback';
import { createSupabaseSessionFromOAuthUrl } from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { useThemedStyles, type AppTheme } from '@/src/theme';

// The link that opened this screen: the latest one the phone handed over (cold start or from the background),
// or, if it is still on its way, the next one within a few seconds.
async function openedLink(waitMs = 3000): Promise<string | null> {
  const known = Linking.getLinkingURL() ?? (await Linking.getInitialURL());
  if (known) return known;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      clearTimeout(timer);
      subscription.remove();
      resolve(url);
    });
    timer = setTimeout(() => {
      subscription.remove();
      resolve(null);
    }, waitMs);
  });
}

export default function AuthCallbackScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    const complete = async () => {
      const url = await openedLink();
      try {
        if (!url) throw new Error('no_url');
        await createSupabaseSessionFromOAuthUrl(url);
        await AsyncStorage.removeItem(RESET_ASKED_KEY).catch(() => undefined);
        const destination = isPasswordRecoveryUrl(url) ? '/password/reset' : await getPostLoginDestination();
        if (isActive) router.replace(destination);
      } catch (error) {
        // Names of what arrived and Supabase's error code only: never the link, tokens or code.
        const summary = callbackSummary(url);
        logError(`인증 링크 처리 실패 (${summary})`, error);
        const askedAt = Number(await AsyncStorage.getItem(RESET_ASKED_KEY).catch(() => null)) || null;
        if (!isActive) return;
        router.replace(isRecoveryAttempt(url, askedAt, Date.now())
          ? { pathname: '/password/forgot', params: { linkError: summary } }
          : { pathname: '/login', params: { oauthError: '1' } });
      }
    };

    void complete();
    return () => {
      isActive = false;
    };
  }, [router]);

  return <View style={styles.screen} />;
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
  } as const;
}
