import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { AUTH_CALLBACK_PATH, getAuthCallbackParams } from '@/src/features/auth/authCallback';
import { getSupabaseClient } from '@/src/lib/supabase';

export type SocialLoginProvider = 'google' | 'kakao';

export type SocialLoginResult =
  { status: 'cancelled' } | { status: 'redirected' } | { session: Session; status: 'success' };

export function getSocialOAuthRedirectUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export async function createSupabaseSessionFromOAuthUrl(url: string) {
  const params = getAuthCallbackParams(url);
  const oauthError =
    params.get('error_description') ?? params.get('error_code') ?? params.get('error');

  if (oauthError) throw new Error(oauthError);

  const supabase = getSupabaseClient();
  const code = params.get('code');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      throw new Error('OAuth 콜백에 세션 정보가 없습니다.');
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error('소셜 로그인 세션을 확인하지 못했습니다.');
  }

  return data.session;
}

export async function signInWithSocialProvider(
  provider: SocialLoginProvider,
): Promise<SocialLoginResult> {
  const supabase = getSupabaseClient();
  const redirectTo = getSocialOAuthRedirectUrl();
  const isWeb = Platform.OS === 'web';
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: !isWeb,
    },
  });

  if (error) throw error;

  if (isWeb) {
    return { status: 'redirected' };
  }

  if (!data.url) throw new Error('OAuth 로그인 주소를 생성하지 못했습니다.');

  const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
    return { status: 'cancelled' };
  }
  if (authResult.type !== 'success') {
    throw new Error('OAuth 인증을 완료하지 못했습니다.');
  }

  const session = await createSupabaseSessionFromOAuthUrl(authResult.url);
  return { session, status: 'success' };
}
