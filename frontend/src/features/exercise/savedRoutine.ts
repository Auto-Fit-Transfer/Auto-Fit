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

// The minutes sent for a move. A saved routine refuses a finished move under 1 minute, so a short one counts as 1.
export function itemMinutes(elapsedSeconds: number, completed: boolean, savedRoutine: boolean) {
  const minutes = Math.max(0, Math.round(elapsedSeconds / 60));
  return completed && savedRoutine ? Math.max(1, minutes) : minutes;
}
