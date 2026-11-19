import type { PostureCapability } from '../../api/posture';
import type { ExerciseItem } from './exerciseData';

// The server's validated posture profile for a routine move: its catalog key, else the exact Korean name.
// Never a part of the name ('스플릿 스쿼트' is not 스쿼트).
export function postureFor(list: PostureCapability[], exercise?: Pick<ExerciseItem, 'exerciseKey' | 'name'>) {
  if (!exercise) return undefined;
  return list.find((item) => item.validation_status === 'validated'
    && ((exercise.exerciseKey ? item.catalog_exercise_keys.includes(exercise.exerciseKey) : false)
      || item.display_name_ko === exercise.name));
}
