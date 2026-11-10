// Pure parts of ending a workout on a high-risk symptom; ExerciseSessionContext wires them to the API.

type ItemProgress = {
  phase: string;
  currentSet: number;
  currentRep: number;
  exercise: { mode: string; targetRepetitions: number | null; totalSets: number };
};

// Sets already finished. In a rest the set just done counts; during a set only the earlier ones do.
export function finishedProgress({ phase, currentSet, currentRep, exercise }: ItemProgress) {
  const inRest = phase === 'rest';
  const completedSets = Math.min(exercise.totalSets, Math.max(0, inRest ? currentSet : currentSet - 1));
  const performedRepetitions = exercise.mode === 'reps'
    ? completedSets * (exercise.targetRepetitions ?? 0) + (inRest ? 0 : currentRep)
    : null;
  return { completedSets, performedRepetitions };
}

// Kept apart from a user's own skip so the record shows why the item stopped.
export const SYMPTOM_STOP_REASON = '운동 중 증상으로 중단';

type StopSteps = {
  settleQueued: () => Promise<unknown>[];
  queueCurrentItem: (() => Promise<unknown>[]) | null;
  sendStop: () => Promise<unknown>;
  log: (message: string, error: unknown) => void;
};

// Waits for every item write before the next step, so the server's stop does not race them,
// and sends the stop once even when an item write failed.
export async function runStopSequence({ settleQueued, queueCurrentItem, sendStop, log }: StopSteps) {
  const settle = async (tasks: Promise<unknown>[], message: string) => {
    for (const outcome of await Promise.allSettled(tasks)) {
      if (outcome.status === 'rejected') log(message, outcome.reason);
    }
  };
  await settle(settleQueued(), 'Exercise item result failed before stop');
  if (queueCurrentItem) await settle(queueCurrentItem(), 'Stopped exercise item result failed');
  try {
    await sendStop();
  } catch (error) {
    log('Exercise stop record failed', error);
  }
}
