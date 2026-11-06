import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getAllergies } from '@/src/api/allergies';
import { allergyNamesFrom } from '@/src/features/diet/allergyConflict';

// Read again on every focus, so a change in My settings re-checks the meals already shown.
// A failed read keeps the last names; it never hides the meals.
export function useAllergyNames() {
  const [names, setNames] = useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    let live = true;
    void getAllergies()
      .then((result) => { if (live) setNames(allergyNamesFrom(result)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []));
  return names;
}
