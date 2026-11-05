import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { createSupabaseSessionFromOAuthUrl } from '@/src/features/auth/socialOAuth';
import { getPostLoginDestination } from '@/src/features/auth/postLoginDestination';
import { useThemedStyles, type AppTheme } from '@/src/theme';

export default function OAuthCallbackScreen() {
  const styles = useThemedStyles(createStyles);
  const callbackUrl = Linking.useLinkingURL();
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    const completeOAuth = async () => {
      try {
        const url = callbackUrl ?? (await Linking.getInitialURL());
        if (!url) throw new Error('OAuth 콜백 주소를 확인하지 못했습니다.');

        await createSupabaseSessionFromOAuthUrl(url);
        const destination = await getPostLoginDestination();
        if (isActive) router.replace(destination);
      } catch (error) {
        console.error('소셜 로그인 콜백 처리 실패:', error);
        if (!isActive) return;

        router.replace({
          pathname: '/login',
          params: {
            oauthError: error instanceof Error ? error.message : '소셜 로그인에 실패했습니다.',
          },
        });
      }
    };

    void completeOAuth();
    return () => {
      isActive = false;
    };
  }, [callbackUrl, router]);

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
