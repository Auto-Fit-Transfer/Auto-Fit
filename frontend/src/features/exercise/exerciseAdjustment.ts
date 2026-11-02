type AdjustableExercise = {
  caloriesBurned: number | null;
  durationMinutes: number | null;
  id: string;
  intensity: string | null;
  mode: 'reps' | 'timed';
  repetitions: number | null;
  sets: number | null;
  targetRepetitions: number | null;
  targetSeconds: number | null;
  targetWeightKg?: number | null;
  totalSets: number;
};

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonnegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function mergeAdjustedExercises<T extends AdjustableExercise>(
  exercises: T[],
  currentExerciseIndex: number,
  adjustedItems: unknown[],
): T[] {
  const adjustedById = new Map<string, Record<string, unknown>>();
  for (const item of adjustedItems) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      if (typeof record.exercise_item_id === 'string') {
        adjustedById.set(record.exercise_item_id, record);
      }
    }
  }

  return exercises.map((exercise, index) => {
    if (index <= currentExerciseIndex) return exercise;
    const adjusted = adjustedById.get(exercise.id);
    if (!adjusted) return exercise;
    const durationMinutes = positiveNumber(adjusted.duration_minutes) ?? exercise.durationMinutes;
    const sets = positiveNumber(adjusted.sets) ?? exercise.sets;
    const repetitions = positiveNumber(adjusted.repetitions) ?? exercise.repetitions;
    const targetSeconds =
      positiveNumber(adjusted.target_duration_seconds) ?? exercise.targetSeconds;
    return {
      ...exercise,
      caloriesBurned: nonnegativeNumber(adjusted.calories_burned) ?? exercise.caloriesBurned,
      durationMinutes,
      intensity: typeof adjusted.intensity === 'string' ? adjusted.intensity : exercise.intensity,
      repetitions,
      sets,
      targetRepetitions: exercise.mode === 'reps' ? repetitions : exercise.targetRepetitions,
      targetSeconds: exercise.mode === 'timed' ? targetSeconds : exercise.targetSeconds,
      targetWeightKg: nonnegativeNumber(adjusted.target_weight_kg) ?? exercise.targetWeightKg,
      totalSets: exercise.mode === 'reps' ? (sets ?? exercise.totalSets) : exercise.totalSets,
    };
  });
}
