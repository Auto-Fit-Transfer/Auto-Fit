export type ExerciseDayStatus = 'not-created' | 'ready' | 'completed';
export type ExerciseLocation = 'gym' | 'home' | 'outdoor' | 'other';
export type ExerciseEquipment = 'machine' | 'band' | 'dumbbell' | 'bodyweight' | 'other';
export type ExerciseBodyPart =
  '코어' | '등' | '가슴' | '어깨' | '허리' | '둔근' | '종아리' | '팔' | '전신';

export interface ExerciseCondition {
  availableMinutes: number | null;
  location: ExerciseLocation | null;
  equipment: ExerciseEquipment[];
  condition: string;
  discomfortArea: string;
}

export interface ExerciseItem {
  caloriesBurned: number | null;
  demoVideoUrl: string | null;
  durationMinutes: number | null;
  executionType: string | null;
  id: string;
  instruction: string | null;
  intensity: string | null;
  name: string;
  planSessionId?: string | null;
  prescription: string;
  recommendationId: string | null;
  repetitions: number | null;
  restSeconds: number | null;
  sequenceOrder: number | null;
  sets: number | null;
  targetDurationSeconds: number | null;
  targetWeightKg: number | null;
  thumbnailUrl: string | null;
}

export interface ExercisePlanSession {
  id: string;
  scheduledDate: string;
  name: string;
  focus: string | null;
  durationMinutes: number;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped';
  exercises: ExerciseItem[];
}

export interface ExerciseRoutine {
  id: string | null;
  title: string;
  subtitle: string;
  intensity: string;
  estimatedCalories: number | null;
  totalDurationMinutes: number | null;
  exercises: ExerciseItem[];
  generator: 'auto-fit-ai' | 'rules_v1' | null;
  planSessions: ExercisePlanSession[];
  selectedPlanSessionId: string | null;
  reasons: string[];
}

export const initialExerciseCondition: ExerciseCondition = {
  availableMinutes: null,
  location: null,
  equipment: [],
  condition: '',
  discomfortArea: '',
};

export const exerciseLocationLabels: Record<ExerciseLocation, string> = {
  gym: '헬스장',
  home: '집',
  outdoor: '야외',
  other: '기타',
};

export const exerciseEquipmentLabels: Record<ExerciseEquipment, string> = {
  machine: '머신',
  band: '밴드',
  dumbbell: '덤벨',
  bodyweight: '맨몸',
  other: '기타',
};

// TODO: Replace this temporary presentation mapping when the recommendation API exposes body parts.
const mockExerciseBodyPartsByName: Record<string, ExerciseBodyPart[]> = {
  버드독: ['코어', '둔근'],
  랫풀다운: ['등', '팔'],
  '시티드 로우': ['등', '팔'],
  '덤벨 로우': ['등', '팔'],
  플랭크: ['코어'],
  '전신 워밍업 스트레칭': ['전신'],
  '가벼운 지속 달리기': ['종아리'],
  '마무리 스트레칭': ['전신'],
  푸시업: ['가슴', '팔'],
  '숄더 프레스': ['어깨', '팔'],
  브릿지: ['둔근', '코어'],
  스쿼트: ['둔근', '종아리'],
  런지: ['둔근', '종아리'],
  데드버그: ['코어'],
  슈퍼맨: ['허리'],
};

export function getMockExerciseBodyParts(exerciseName: string): ExerciseBodyPart[] {
  return mockExerciseBodyPartsByName[exerciseName] ?? ['전신'];
}
