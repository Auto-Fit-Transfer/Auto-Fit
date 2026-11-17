import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Renewal A's quests that the server does not know about yet (water, stretching): kept on this phone,
// one record per day for the last two weeks (the report counts a week of them).
// shortcut: a new phone or a reinstall starts again; move to the server when it gets quest records.
const KEY = 'auto-fit.a.quests.v2';
const OLD_KEY = 'auto-fit.a.quests.v1'; // one day only: { date, water, stretch }
const KEPT_DAYS = 14;
export const WATER_GOAL = 6;

type Day = { water: number; stretch: boolean };
export type QuestLog = Record<string, Day>; // by day, 2026-11-12
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const clean = (day: Partial<Day> | undefined): Day => ({
  water: Math.min(WATER_GOAL, Math.max(0, Number(day?.water) || 0)),
  stretch: Boolean(day?.stretch),
});

export async function readQuestLog(): Promise<QuestLog> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, Partial<Day>>;
      return Object.fromEntries(Object.entries(parsed).map(([date, day]) => [date, clean(day)]));
    }
    const old = await AsyncStorage.getItem(OLD_KEY);
    const day = old ? (JSON.parse(old) as Partial<Day> & { date?: string }) : null;
    return day?.date ? { [day.date]: clean(day) } : {};
  } catch {
    return {};
  }
}

let writes: Promise<unknown> = Promise.resolve();

export function useDailyQuests() {
  const [date, setDate] = useState(todayKey);
  const [day, setDay] = useState<Day>(() => clean(undefined));

  useEffect(() => {
    let active = true;
    void readQuestLog().then((log) => {
      if (active && log[todayKey()]) setDay(log[todayKey()]);
    });
    return () => {
      active = false;
    };
  }, []);

  const change = useCallback((next: (now: Day) => Day) => {
    const today = todayKey();
    setDate(today);
    setDay((now) => {
      // Yesterday's record is not today's.
      const updated = next(today === date ? now : clean(undefined));
      // One write after another, so two quick taps cannot land in the wrong order.
      writes = writes
        .then(readQuestLog)
        .then((log) => {
          const days = Object.entries({ ...log, [today]: updated }).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEPT_DAYS);
          return AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(days)));
        })
        .catch(() => undefined);
      return updated;
    });
  }, [date]);

  const now = date === todayKey() ? day : clean(undefined);
  return {
    water: now.water,
    stretch: now.stretch,
    addWater: () => change((current) => ({ ...current, water: Math.min(WATER_GOAL, current.water + 1) })),
    doStretch: () => change((current) => ({ ...current, stretch: true })),
  };
}
