import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { getDisplayPreferences, saveDisplayPreferences, type DisplayPreferences } from '@/src/api/userSettings';
import { getSupabaseClient } from '@/src/lib/supabase';

const defaults: DisplayPreferences = {
  theme_mode: 'system', font_size_step: 3, simple_mode_enabled: false,
};

type DisplayContextValue = {
  preferences: DisplayPreferences;
  isDark: boolean;
  ready: boolean;
  serverSynced: boolean | null;
  save: (value: DisplayPreferences) => Promise<void>;
};

const DisplayContext = createContext<DisplayContextValue | null>(null);
const storageKey = (userId: string) => `auto-fit-display-preferences:${userId}`;
const pendingKey = (userId: string) => `auto-fit-display-preferences-pending:${userId}`;

function validPreferences(value: unknown): value is DisplayPreferences {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<DisplayPreferences>;
  return ['system', 'light', 'dark'].includes(item.theme_mode ?? '')
    && [1, 2, 3, 4, 5].includes(item.font_size_step ?? 0)
    && typeof item.simple_mode_enabled === 'boolean';
}

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [preferences, setPreferences] = useState<DisplayPreferences>(defaults);
  const [ready, setReady] = useState(false);
  const [serverSynced, setServerSynced] = useState<boolean | null>(null);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    const auth = getSupabaseClient().auth;
    void auth.getSession().then(({ data }) => {
      if (active) { setUserId(data.session?.user.id ?? null); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: listener } = auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    const requestVersion = ++version.current;
    void (async () => {
      if (!active) return;
      setPreferences(defaults);
      setServerSynced(null);
      if (!userId) { setReady(true); return; }
      setReady(false);
      let local: DisplayPreferences | null = null;
      let pending = false;
      try {
        const [cached, pendingValue] = await Promise.all([
          AsyncStorage.getItem(storageKey(userId)), AsyncStorage.getItem(pendingKey(userId)),
        ]);
        pending = pendingValue === '1';
        if (active && requestVersion === version.current && cached) {
          const parsed: unknown = JSON.parse(cached);
          if (validPreferences(parsed)) { local = parsed; setPreferences(parsed); }
        }
      } catch { /* Invalid local cache falls back to defaults. */ }
      if (active && requestVersion === version.current) setReady(true);
      try {
        const { preferences: remote } = pending && local
          ? await saveDisplayPreferences(local) : await getDisplayPreferences();
        if (active && requestVersion === version.current && validPreferences(remote)) {
          setPreferences(remote);
          setServerSynced(true);
          await AsyncStorage.setItem(storageKey(userId), JSON.stringify(remote));
          if (pending) await AsyncStorage.removeItem(pendingKey(userId));
        }
      } catch { if (active && requestVersion === version.current) setServerSynced(false); }
    })();
    return () => { active = false; };
  }, [authReady, userId]);

  const save = useCallback(async (value: DisplayPreferences) => {
    if (!validPreferences(value)) return;
    const requestVersion = ++version.current;
    setPreferences(value);
    if (userId) {
      await Promise.all([
        AsyncStorage.setItem(storageKey(userId), JSON.stringify(value)),
        AsyncStorage.setItem(pendingKey(userId), '1'),
      ]);
      try {
        const { preferences: remote } = await saveDisplayPreferences(value);
        if (requestVersion === version.current && validPreferences(remote)) {
          setPreferences(remote);
          setServerSynced(true);
          await AsyncStorage.setItem(storageKey(userId), JSON.stringify(remote));
          await AsyncStorage.removeItem(pendingKey(userId));
        }
      } catch { if (requestVersion === version.current) setServerSynced(false); }
    }
  }, [userId]);

  useEffect(() => {
    if (typeof Appearance.setColorScheme !== 'function') return;
    Appearance.setColorScheme(preferences.theme_mode === 'system' ? 'auto' : preferences.theme_mode);
    return () => Appearance.setColorScheme('auto');
  }, [preferences.theme_mode]);

  const isDark = preferences.theme_mode === 'dark'
    || (preferences.theme_mode === 'system' && systemScheme === 'dark');
  const value = useMemo(() => ({ preferences, isDark, ready, serverSynced, save }),
    [preferences, isDark, ready, serverSynced, save]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplayPreferences() {
  const value = useContext(DisplayContext);
  if (!value) throw new Error('DisplayPreferencesProvider is missing');
  return value;
}
