import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getHabitTierProgress } from '@/src/api/tier';

import { WHO_KEY, whoList, type Who } from './sprites';

const tierCodes = ['CORE', 'BALANCE', 'ACTIVE', 'FIT', 'PEAK'] as const;

// My character as it looks now: who I chose (kept on this phone) at the tier the server says I am in.
// Screens that show the character's face next to what it says use this.
export function useHero() {
  const [who, setWho] = useState<Who>('worker-f');
  const [tierIndex, setTierIndex] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void AsyncStorage.getItem(WHO_KEY)
        .then((saved) => {
          if (active && whoList.includes(saved as Who)) setWho(saved as Who);
        })
        .catch(() => undefined);
      void getHabitTierProgress()
        .then(({ progress }) => {
          if (active) setTierIndex(Math.max(0, tierCodes.indexOf(progress.tier_code)));
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );
  return { who, tierIndex };
}
