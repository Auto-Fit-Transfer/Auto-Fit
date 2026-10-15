export function getScoreRatio(score: number | null, total: number | null): number {
  if (
    score === null ||
    total === null ||
    !Number.isFinite(score) ||
    !Number.isFinite(total) ||
    total <= 0
  )
    return 0;
  return Math.min(1, Math.max(0, score / total));
}
