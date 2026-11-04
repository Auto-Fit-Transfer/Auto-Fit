import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getExerciseHistory } from '@/src/api/exercise';
import { sessionLocalDate, sessionMinutes } from '@/src/features/exercise/weeklyMetrics';

export const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Workouts completed from this Monday through today, reloaded whenever the screen regains focus.
export function useWeekWorkouts() {
  const [days, setDays] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const now = new Date();
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      void getExerciseHistory(localDayKey(monday), localDayKey(now))
        .then((response) => {
          if (!active) return;
          const done = response.history.map((row) => row.session).filter((session) => session.status === 'completed');
          setDays(done.map((session) => sessionLocalDate(session.started_at)).sort());
          setMinutes(Math.round(done.reduce((sum, session) => sum + (sessionMinutes(session.total_duration_seconds) ?? 0), 0)));
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  return { days, minutes };
}
