import type { Tier } from './types';

/**
 * Tier-demotion shield weeks remaining after a weekly update.
 *
 * Spec (Notes/mmr.txt §8.3, §16): a 2-week shield is granted on tier promotion,
 * ticks down by 1 on each completed week (so it is earned by consistency, not by
 * the promotion itself), and breaks immediately after 2 consecutive missed weeks.
 *
 * This replaces the previous "default 5 shields for testing" scaffolding that made
 * tier demotion nearly impossible.
 */
export function nextShieldWeeks(params: {
  shieldBefore: number;
  tierPromoted: boolean;
  completedWeek: boolean;
  consecutiveMissedWeeks: number;
}): number {
  const { shieldBefore, tierPromoted, completedWeek, consecutiveMissedWeeks } = params;
  let shield = tierPromoted ? 2 : Math.max(0, shieldBefore);
  if (completedWeek && !tierPromoted && shield > 0) shield = shield - 1;
  if (consecutiveMissedWeeks >= 2) shield = 0;
  return shield;
}

const LOWER_TIERS: ReadonlySet<Tier> = new Set<Tier>(['Iron', 'Bronze', 'Silver', 'Gold']);

/** Flat MMR nudge for a completed week in the lower tiers. */
export const LOWER_TIER_WEEK_BONUS = 50;

/**
 * Small flat MMR bonus for a completed week (A_total >= 0.70) while in the lower
 * tiers (Iron–Gold), so early climb feels responsive without swamping the
 * difficulty-based week score.
 *
 * Replaces the previous bonus that awarded a full rank-division of MMR (200–250)
 * every completed week, which guaranteed ~1 division/week regardless of goal
 * difficulty and bypassed the difficulty tables entirely below Platinum.
 */
export function lowerTierProgressBonus(tier: Tier, completedWeek: boolean): number {
  if (!completedWeek) return 0;
  return LOWER_TIERS.has(tier) ? LOWER_TIER_WEEK_BONUS : 0;
}
