import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Today's steps, from the phone's own step counter (expo-sensors).
// iOS gives the day's count at once. Android only reports steps while the app is open (the package
// says so), so there the count is what was walked with the app open, added up over the day on this phone.
// shortcut: on Android steps walked with the app closed are missed; use Health Connect when that matters.
const KEY = 'auto-fit.a.steps.v1';
export const STEP_GOAL = 6000;

// ask = the phone can count but I have not allowed it yet
export type StepState = 'checking' | 'unavailable' | 'ask' | 'on';

const dayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

export function useSteps() {
  const [state, setState] = useState<StepState>('checking');
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) {
          if (active) setState('unavailable');
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
    };
  }, []);

  useEffect(() => {
    if (state !== 'on') return undefined;
    let active = true;
    let base = 0; // the day's steps before this screen started listening
    const day = dayKey();
    void (async () => {
      try {
        if (Platform.OS === 'ios') {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          base = (await Pedometer.getStepCountAsync(start, new Date())).steps;
        } else {
          const saved = await AsyncStorage.getItem(KEY);
          const kept = saved ? (JSON.parse(saved) as { date?: string; steps?: number }) : null;
          base = kept?.date === day ? Number(kept.steps) || 0 : 0;
        }
      } catch {
        base = 0;
      }
      if (active) setSteps((now) => Math.max(now, base));
    })();
    // result.steps counts from the moment of subscribing
    const subscription = Pedometer.watchStepCount((result) => {
      const total = base + result.steps;
      setSteps(total);
      if (Platform.OS !== 'ios') {
        void AsyncStorage.setItem(KEY, JSON.stringify({ date: day, steps: total })).catch(() => undefined);
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [state]);

  const turnOn = useCallback(async () => {
    try {
      const permission = await Pedometer.requestPermissionsAsync();
      setState(permission.granted ? 'on' : 'ask');
    } catch {
      setState('unavailable');
    }
  }, []);

  return { state, steps, turnOn };
}
