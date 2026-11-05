export function canSaveRecommendedHistorySession(session: Record<string, unknown>): boolean {
  return session.status === 'completed'
    && typeof session.exercise_recommendation_id === 'string'
    && session.exercise_recommendation_id.trim().length > 0
    && session.recommendation_generator === 'auto-fit-ai';
}
