import type { Tier } from '../mmr/types';

export type RankRef = { tier: Tier; division: number | null };
export type RankChange = 'promotion' | 'demotion' | null;

const TIER_ORDER: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];

/**
 * Ordinal rank score: higher is better. Divisions run IV (lowest) → I (highest)
 * within a tier, so we invert division. Master/Challenger have no divisions.
 */
export function rankOrdinal(r: RankRef): number {
  const t = TIER_ORDER.indexOf(r.tier);
  if (t < 0) return -1;
  const div = r.division ?? 1; // no-division tiers sit at the top
  return t * 4 + (4 - div);
}

/** Compare two ranks → 'promotion' | 'demotion' | null (no change / unknown). */
export function detectRankChange(prev: RankRef | null, next: RankRef | null): RankChange {
  if (!prev || !next) return null;
  const a = rankOrdinal(prev);
  const b = rankOrdinal(next);
  if (a < 0 || b < 0) return null;
  if (b > a) return 'promotion';
  if (b < a) return 'demotion';
  return null;
}

/** Stable string key for persisting "last seen rank" (e.g. "Gold-2"). */
export function rankKey(r: RankRef): string {
  return `${r.tier}-${r.division ?? 0}`;
}
