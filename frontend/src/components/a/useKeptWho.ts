import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { WHO_KEY, whoList, type Who } from './sprites';

// The character I made, kept on this phone. For pictures that show it without asking the server
// (the street while joining, the loading look); `skip` is for when the caller already knows who.
export function useKeptWho(skip = false) {
  const [who, setWho] = useState<Who>('worker-f');
  useEffect(() => {
    if (skip) return;
    void AsyncStorage.getItem(WHO_KEY)
      .then((saved) => {
        if (whoList.includes(saved as Who)) setWho(saved as Who);
      })
      .catch(() => undefined);
  }, [skip]);
  return who;
}
