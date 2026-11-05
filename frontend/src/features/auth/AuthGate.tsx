import { useEffect, useState } from 'react';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { clearPickerCache, syncLocalOwner } from '@/src/features/auth/accountSession';
import { hasUsableSession, isPublicRoute } from '@/src/features/auth/startDestination';
import { getSupabaseClient } from '@/src/lib/supabase';

type AuthState = 'checking' | 'signedIn' | 'signedOut';

// Covers every signed-in screen in one place. The server still decides who can read what.
export function AuthGate({ background }: { background: string }) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const [client] = useState(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  });
  const [auth, setAuth] = useState<AuthState>(client ? 'checking' : 'signedOut');
  const isPublic = isPublicRoute(segments);

  useEffect(() => {
    clearPickerCache();
    if (!client) return undefined;
    let active = true;
    void client.auth.getSession().then((result) => {
      if (!active) return;
      setAuth((current) => (current !== 'checking' ? current : hasUsableSession(result) ? 'signedIn' : 'signedOut'));
      if (result.data.session) void syncLocalOwner(result.data.session.user.id);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuth('signedOut');
        void syncLocalOwner(null);
      } else if (session) {
        setAuth('signedIn');
        void syncLocalOwner(session.user.id);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (auth === 'signedOut' && !isPublic && navigationReady) router.replace('/login');
  }, [auth, isPublic, navigationReady, router]);

  if (auth === 'signedIn' || isPublic) return null;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />;
}
