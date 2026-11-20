// Saved routines run as their own sessions (back-end fc0bd14).

// The items a saved-routine session already recorded: its logs carry saved_routine_session_item_id.
export function recordedItemIds(logs: readonly unknown[]) {
  return new Set(
    logs.flatMap((log) => {
      const id = (log as { saved_routine_session_item_id?: unknown } | null)?.saved_routine_session_item_id;
      return typeof id === 'string' && id ? [id] : [];
    }),
  );
}

// A saved routine records a finished move only from 1 recorded minute, and minutes are rounded: 30 s.
// How long the move has to go on before it can finish; 0 for the recommended workout.
export const msToFirstMinute = (savedRoutine: boolean, elapsedMs: number) => (savedRoutine ? Math.max(0, 30_000 - elapsedMs) : 0);
