import type { LiveLocation } from './liveTracking';

// QA builds only (EXPO_PUBLIC_RUN_QA=1, eas profile testflight-qa): the run screen lists what it did, with times,
// so a tester can read pause timing and why a position was left out. Never coordinates or tokens.
export const RUN_QA = process.env.EXPO_PUBLIC_RUN_QA === '1';

export type QaInject = 'low_accuracy' | 'small_movement' | 'gps_jump';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
export const qaStamp = (date: Date) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;

// A test position for the QA buttons. It goes through the same path as a phone fix, and the server must refuse it:
// accuracy 80 m fails the 50 m check; the other two need an accepted point first, so a test point is never the
// first point of a run (which the server would store).
export function qaPosition(kind: QaInject, lastAccepted: LiveLocation | null, here: LiveLocation | null): LiveLocation | null {
  if (kind === 'low_accuracy') {
    const at = here ?? lastAccepted;
    return at ? { latitude: at.latitude, longitude: at.longitude, accuracy: 80 } : null;
  }
  if (!lastAccepted) return null;
  if (kind === 'small_movement') return { latitude: lastAccepted.latitude, longitude: lastAccepted.longitude, accuracy: 5 };
  // About 100 km: over 12 m/s unless the last accepted point is more than about 2 hours old.
  return { latitude: lastAccepted.latitude + (lastAccepted.latitude > 0 ? -0.9 : 0.9), longitude: lastAccepted.longitude, accuracy: 5 };
}

let lines: string[] = [];
const listeners = new Set<() => void>();

export function qaLog(text: string, now = new Date()) {
  if (!RUN_QA) return;
  lines = [`${qaStamp(now)}  ${text}`, ...lines].slice(0, 80);
  listeners.forEach((listener) => listener());
}

// For useSyncExternalStore on the run screen; no React here, so the hook's tests load this file as it is.
export const subscribeQaLog = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const readQaLog = () => lines;
