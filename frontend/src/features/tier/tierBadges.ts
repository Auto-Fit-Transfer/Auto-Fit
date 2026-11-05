import ActiveBadge from '@/assets/tier/active.svg';
import BalanceBadge from '@/assets/tier/balance.svg';
import CoreBadge from '@/assets/tier/core.svg';
import FitBadge from '@/assets/tier/fit.svg';
import PeakBadge from '@/assets/tier/peak.svg';
import type { HabitTierProgress } from '@/src/api/tier';

export const tierBadges = { CORE: CoreBadge, BALANCE: BalanceBadge, ACTIVE: ActiveBadge, FIT: FitBadge, PEAK: PeakBadge };
export const tierOrder = ['CORE', 'BALANCE', 'ACTIVE', 'FIT', 'PEAK'] as const;
export const tierColors = { CORE: '#557447', BALANCE: '#1C7186', ACTIVE: '#B35A1E', FIT: '#3A2DB5', PEAK: '#94701A' };
// Figma's dark bar exists for FIT only; the other tiers use their dark tier color from the palette.
export const darkTierColors = { CORE: '#A9CC98', BALANCE: '#7FCBDD', ACTIVE: '#F2AE7E', FIT: '#5B4BE6', PEAK: '#E8C766' };
export const tierDescriptions = {
  CORE: '건강관리를 시작했어요',
  BALANCE: '건강의 균형을 잡아 가고 있어요',
  ACTIVE: '꾸준히 실천하고 있어요',
  FIT: '나에게 맞는 건강관리를 안정적으로 하고 있어요',
  PEAK: '건강한 흐름을 잘 유지하고 있어요',
};

export function nextTierName(tier: HabitTierProgress) {
  if (tier.next_level_points === null) return null;
  if (tier.sublevel < 3) return `${tier.tier_name} ${tier.sublevel + 1}`;
  const next = tierOrder[tierOrder.indexOf(tier.tier_code) + 1];
  return next ? `${next} 1` : null;
}
