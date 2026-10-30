import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type SignupGender = 'male' | 'female';
export type SignupExerciseGoal = 'fat-loss' | 'muscle-gain' | 'stamina' | 'conditioning' | 'custom';
export type SignupExerciseExperience = 'beginner' | 'intermediate' | 'advanced';

export interface SignupDraft {
  email: string;
  name: string;
  birthDate: string | null;
  gender: SignupGender | undefined;
  selectedAllergens: string[];
  otherAllergy: string;
  exerciseGoal: SignupExerciseGoal;
  exerciseExperience: SignupExerciseExperience;
  customGoal: string;
}

const initialSignupDraft: SignupDraft = {
  email: '',
  name: '',
  birthDate: null,
  gender: undefined,
  selectedAllergens: [],
  otherAllergy: '',
  exerciseGoal: 'fat-loss',
  exerciseExperience: 'beginner',
  customGoal: '',
};

interface SignupContextValue {
  draft: SignupDraft;
  resetDraft: () => void;
  updateDraft: (values: Partial<SignupDraft>) => void;
}

const SignupContext = createContext<SignupContextValue | null>(null);

export function SignupProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SignupDraft>(initialSignupDraft);

  const updateDraft = useCallback((values: Partial<SignupDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
  }, []);

  const resetDraft = useCallback(() => setDraft(initialSignupDraft), []);
  const value = useMemo(
    () => ({ draft, resetDraft, updateDraft }),
    [draft, resetDraft, updateDraft],
  );

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
}

export function useSignup() {
  const value = useContext(SignupContext);
  if (!value) throw new Error('useSignup은 SignupProvider 안에서 사용해야 합니다.');
  return value;
}
