import type { HabitTierProgress } from '@/src/api/tier';

import { nextTierName, tierOrder } from './tierBadges';

// The server's habit tier the way renewal A shows it (home, report): which of the five, its stars, how far
// along the bar, and the words "BALANCE까지 · 120점".
export function tierLook(tier: HabitTierProgress) {
  const next = nextTierName(tier);
  const span = tier.next_level_points !== null ? tier.next_level_points - tier.level_start_points : 0;
  return {
    index: Math.max(0, tierOrder.indexOf(tier.tier_code)),
    name: tier.tier_name,
    stars: tier.sublevel,
    ratio: span > 0 ? Math.min(100, Math.max(0, ((tier.points - tier.level_start_points) / span) * 100)) : 100,
    left: tier.next_level_points !== null ? `${Math.max(0, tier.next_level_points - tier.points).toLocaleString('ko-KR')}점` : tier.tier_name,
    next: next ? `${next}까지` : '가장 높은 티어',
  };
}
export type TierLook = ReturnType<typeof tierLook>;
