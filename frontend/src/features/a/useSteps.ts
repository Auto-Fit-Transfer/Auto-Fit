import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Today's steps, from the phone's own step counter (expo-sensors).
// iOS gives the day's count at once. Android only reports steps while the app is open (the package
// says so), so there the count is what was walked with the app open, added up over the day on this phone.
// shortcut: on Android steps walked with the app closed are missed; use Health Connect when that matters.
const KEY = 'auto-fit.a.steps.log.v1'; // Android: steps by day (2026-11-12), the last two weeks
const OFF_KEY = 'auto-fit.a.steps.off'; // '1' = I switched counting off in 내 정보
export const STEP_GOAL = 6000;

// ask = the phone can count but I have not allowed it yet; off = I switched counting off myself
export type StepState = 'checking' | 'unavailable' | 'ask' | 'off' | 'on';
// The home screen and 내 정보 are open at the same time (tabs), so a switch on one is told to the other.
const listeners = new Set<(state: StepState) => void>();
const tell = (state: StepState) => listeners.forEach((listener) => listener(state));

const dayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const readLog = async () => {
  const saved = await AsyncStorage.getItem(KEY);
  return saved ? (JSON.parse(saved) as Record<string, number>) : {};
};

// The steps of the given days (keys like 2026-11-12), for the report. null = this phone is not counting.
// iOS keeps a week of steps itself; on Android it is what this app has kept.
export async function readSteps(keys: string[]): Promise<Record<string, number> | null> {
  try {
    if ((await AsyncStorage.getItem(OFF_KEY)) === '1') return null;
    if (!(await Pedometer.isAvailableAsync()) || !(await Pedometer.getPermissionsAsync()).granted) return null;
    if (Platform.OS !== 'ios') {
      const log = await readLog();
      return Object.fromEntries(keys.filter((key) => key in log).map((key) => [key, Number(log[key]) || 0]));
    }
    const now = Date.now();
    const rows = await Promise.all(
      keys.map(async (key) => {
        const [year, month, date] = key.split('-').map(Number);
        const start = new Date(year, month - 1, date);
        if (start.getTime() > now) return null;
        const end = new Date(Math.min(now, new Date(year, month - 1, date + 1).getTime()));
        return [key, (await Pedometer.getStepCountAsync(start, end)).steps] as const;
      }),
    );
    return Object.fromEntries(rows.filter((row) => row !== null));
  } catch {
    return null;
  }
}

export function useSteps() {
  const [state, setState] = useState<StepState>('checking');
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    let active = true;
    listeners.add(setState);
    void (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) {
          if (active) setState('unavailable');
          return;
        }
        if ((await AsyncStorage.getItem(OFF_KEY)) === '1') {
          if (active) setState('off');
          return;
        }
        const permission = await Pedometer.getPermissionsAsync();
        if (active) setState(permission.granted ? 'on' : 'ask');
      } catch {
        if (active) setState('unavailable');
      }
    })();
    return () => {
      active = false;
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (state !== 'on') return undefined;
    let active = true;
    let base = 0; // the day's steps before this screen started listening
    let log: Record<string, number> | null = null; // Android: nothing is written until what was kept is read
    const day = dayKey();
    void (async () => {
      try {
        if (Platform.OS === 'ios') {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          base = (await Pedometer.getStepCountAsync(start, new Date())).steps;
        } else {
          log = await readLog();
          base = Number(log[day]) || 0;
        }
      } catch {
        base = 0;
        if (Platform.OS !== 'ios') log = {}; // what was kept cannot be read: start the log again
      }
      if (active) setSteps((now) => Math.max(now, base));
    })();
    // result.steps counts from the moment of subscribing
    const subscription = Pedometer.watchStepCount((result) => {
      const total = base + result.steps;
      setSteps(total);
      if (log) {
        log = Object.fromEntries(Object.entries({ ...log, [day]: total }).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14));
        void AsyncStorage.setItem(KEY, JSON.stringify(log)).catch(() => undefined);
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [state]);

  const turnOn = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(OFF_KEY);
      const permission = await Pedometer.requestPermissionsAsync();
      tell(permission.granted ? 'on' : 'ask');
    } catch {
      tell('unavailable');
    }
  }, []);
  const turnOff = useCallback(() => {
    tell('off');
    void AsyncStorage.setItem(OFF_KEY, '1').catch(() => undefined);
  }, []);

  return { state, steps, turnOn, turnOff };
}
