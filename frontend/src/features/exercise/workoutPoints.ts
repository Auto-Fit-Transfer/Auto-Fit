// The server's +5 rule for a recommended workout (backend, 11/18): the session is completed, a completed move has at
// least one set, and the recorded time is over 0 minutes. The app records each move's time in whole minutes
// (rounded), so the check uses the same numbers the server receives.
type MoveResult = { completed: boolean; completedSets: number; elapsedSeconds: number };

export function earnsWorkoutPoints(results: readonly MoveResult[]) {
  const minutes = results.reduce((total, result) => total + Math.max(0, Math.round(result.elapsedSeconds / 60)), 0);
  return minutes > 0 && results.some((result) => result.completed && result.completedSets >= 1);
}

export type WorkoutPoints = 'awarded' | 'not_awarded' | null;

// The server's answer: already_awarded is a repeat of an earlier award, so nothing is missing.
export const pointsOutcome = (answer: { awarded: boolean; reason: string }): WorkoutPoints =>
  answer.awarded || answer.reason === 'already_awarded' ? 'awarded' : 'not_awarded';
