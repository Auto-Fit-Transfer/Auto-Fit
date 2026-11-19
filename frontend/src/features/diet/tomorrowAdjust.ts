// 내일 맞추기, gentle_rebalance_v1 (ai c60e7a5, 11/19): what went over is shared among the picked meals, but a
// meal gives up at most 15% of its target, so part of it may stay. The server's `adjustment` has the real numbers;
// this is only the estimate shown while picking (a meal's kcal stands in for its target).
export const MAX_CUT = 0.15;

export function plannedCuts(over: number, kcals: (number | null)[]) {
  if (!kcals.length || over <= 0) return kcals.map(() => 0);
  const share = over / kcals.length;
  return kcals.map((kcal) => Math.round(kcal == null ? share : Math.min(share, kcal * MAX_CUT)));
}
