export type ExerciseAnalysis = {
  generator: string;
  summary: string;
  metrics: { completion_rate: number; duration_minutes: number; calories_burned: number };
  feedback_summary: { difficulty: string; post_condition: string; uncomfortable_areas: string[] };
  insights: string[];
  next_session_adjustments: string[];
  safety_notice: string | null;
};

const areaLabels: Record<string, string> = {
  shoulder: '어깨',
  waist: '허리',
  knee: '무릎',
  ankle: '발목',
};

export function mapExerciseAnalysis(analysis: ExerciseAnalysis) {
  const feedback = analysis.feedback_summary;
  return {
    insight: {
      title: analysis.summary,
      description: [...analysis.insights, analysis.safety_notice].filter(Boolean).join('\n'),
    },
    metrics: [
      {
        label: '수행률',
        value: `${analysis.metrics.completion_rate}%`,
        description: '저장된 운동 수행 기록',
      },
      { label: '체감 난이도', value: feedback.difficulty, description: '직접 기록한 난이도' },
      { label: '운동 후 상태', value: feedback.post_condition, description: '직접 기록한 컨디션' },
      {
        label: '불편감',
        value:
          feedback.uncomfortable_areas.map((area) => areaLabels[area] ?? area).join(', ') || '없음',
        description: '직접 기록한 불편 부위',
      },
    ],
    nextWorkout: analysis.next_session_adjustments.map((title) => ({ title, description: '' })),
  };
}
