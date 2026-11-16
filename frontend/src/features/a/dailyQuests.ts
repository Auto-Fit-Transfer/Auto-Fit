import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Renewal A's quests that the server does not know about yet (water, stretching): kept on this phone,
// one record per day. shortcut: a new phone or a reinstall starts the day again; move to the server
// when it gets quest records.
const KEY = 'auto-fit.a.quests.v1';
export const WATER_GOAL = 6;

type Day = { date: string; water: number; stretch: boolean };
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const fresh = (): Day => ({ date: todayKey(), water: 0, stretch: false });

export function useDailyQuests() {
  const [day, setDay] = useState<Day>(fresh);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (!active || !saved) return;
        const parsed = JSON.parse(saved) as Partial<Day>;
        // Yesterday's record is not today's.
        if (parsed.date === todayKey()) {
          setDay({ date: parsed.date, water: Math.min(WATER_GOAL, Math.max(0, Number(parsed.water) || 0)), stretch: Boolean(parsed.stretch) });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const change = useCallback((next: (now: Day) => Day) => {
    setDay((now) => {
      const base = now.date === todayKey() ? now : fresh();
      const updated = next(base);
      void AsyncStorage.setItem(KEY, JSON.stringify(updated)).catch(() => undefined);
      return updated;
    });
  }, []);

  return {
    water: day.date === todayKey() ? day.water : 0,
    stretch: day.date === todayKey() ? day.stretch : false,
    addWater: () => change((now) => ({ ...now, water: Math.min(WATER_GOAL, now.water + 1) })),
    doStretch: () => change((now) => ({ ...now, stretch: true })),
  };
}
