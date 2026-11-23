import type { ExerciseGoalType } from '@/src/api/onboarding';

import type { SignupExerciseGoal } from './SignupContext';

// The sign-up's goal as the server names it (signup/step5 and renewal B's signup/b-save).
export const goalType: Record<SignupExerciseGoal, ExerciseGoalType> = {
  'fat-loss': 'weight_loss',
  'muscle-gain': 'muscle_gain',
  stamina: 'endurance',
  conditioning: 'rehabilitation',
  custom: 'other',
};
