import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// A tier I have already passed can be worn again: my character is drawn as it looked then, while the tier
// itself stays where it is (the tier screen). Kept on this phone; null = the look of the tier I am in.
const KEY = 'auto-fit.a.look.v1';
let worn: number | null = null;
let read = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!read) {
    read = true; // what was kept is read once, when the first character is drawn
    void AsyncStorage.getItem(KEY)
      .then((saved) => {
        const index = Number(saved);
        if (saved === null || !Number.isInteger(index) || index < 0 || index > 4) return;
        worn = index;
        listeners.forEach((each) => each());
      })
      .catch(() => undefined);
  }
  return () => {
    listeners.delete(listener);
  };
}

export const useWorn = () => useSyncExternalStore(subscribe, () => worn, () => null);

export function wear(index: number | null) {
  worn = index;
  listeners.forEach((each) => each());
  void (index === null ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, String(index))).catch(() => undefined);
}

// The look to draw for a character whose tier is `tier`: never one it has not reached.
export const lookOf = (tier: number, wornTier: number | null) => (wornTier === null ? tier : Math.min(wornTier, tier));
