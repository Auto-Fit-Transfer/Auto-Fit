// The server's +5 rule for a recommended workout (backend 2d19a51): the session is completed and one and the same
// move is completed with at least one set and at least 1 recorded minute. Each move's time is stored in whole minutes,
// so the check uses the minutes the server receives.
type MoveResult = { completed: boolean; completedSets: number; elapsedSeconds: number };

export const recordedMinutes = (elapsedSeconds: number) => Math.max(0, Math.round(elapsedSeconds / 60));

export const earnsWorkoutPoints = (results: readonly MoveResult[]) =>
  results.some((result) => result.completed && result.completedSets >= 1 && recordedMinutes(result.elapsedSeconds) >= 1);

export type WorkoutPoints = 'awarded' | 'not_awarded' | null;

// The server's answer: already_awarded is a repeat of an earlier award, so nothing is missing.
export const pointsOutcome = (answer: { awarded: boolean; reason: string }): WorkoutPoints =>
  answer.awarded || answer.reason === 'already_awarded' ? 'awarded' : 'not_awarded';

// Only the server's refusal (409 {detail: {code: TIER_SOURCE_INCOMPLETE}}) means no points; a network or server
// error leaves it unknown, so the screen says nothing about points.
export function refusalOutcome(error: unknown): WorkoutPoints {
  const failed = error as { status?: unknown; detail?: { code?: unknown } | null } | null;
  return failed?.status === 409 && failed.detail?.code === 'TIER_SOURCE_INCOMPLETE' ? 'not_awarded' : null;
}
