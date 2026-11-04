import type { ExerciseCondition, ExerciseEquipment, ExerciseLocation } from './exerciseData';

const locations = new Set<ExerciseLocation>(['gym', 'home', 'outdoor', 'other']);
const equipmentValues = new Set(['machine', 'band', 'dumbbell', 'mat', 'other']);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mapPersistedExerciseCondition(
  response: unknown,
  recommendationId: string | null,
): ExerciseCondition | null {
  const context = record(record(record(response)?.result)?.context);
  if (!context || !recommendationId || context.exercise_recommendation_id !== recommendationId) {
    return null;
  }
  const minutes = context.available_minutes;
  const location = context.location;
  const equipment = context.available_equipment;
  const condition = context.condition_level;
  if (
    typeof minutes !== 'number' ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    typeof location !== 'string' ||
    !locations.has(location as ExerciseLocation) ||
    !Array.isArray(equipment) ||
    !equipment.every((item) => typeof item === 'string' && equipmentValues.has(item)) ||
    typeof condition !== 'string' ||
    !condition.trim()
  ) {
    return null;
  }
  const discomfort = context.discomfort_areas;
  return {
    availableMinutes: minutes,
    location: location as ExerciseLocation,
    equipment: equipment.map((item) =>
      item === 'mat' ? 'bodyweight' : item,
    ) as ExerciseEquipment[],
    condition: condition.trim(),
    discomfortArea:
      Array.isArray(discomfort) && typeof discomfort[0] === 'string' ? discomfort[0].trim() : '',
  };
}
