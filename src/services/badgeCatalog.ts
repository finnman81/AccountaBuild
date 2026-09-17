import { colors } from '../theme';

/**
 * Presentation catalog for badges: emoji, tint, and a short flavor line per
 * badge id. Rendering only — which badges EXIST and when they're earned is the
 * server's business (functions/mmr-compute.js awards, badge doc ids are the
 * dedupe). Unknown ids fall back to a generic medal so a server-side badge
 * added later still renders on old bundles.
 */
export type BadgeLook = { emoji: string; tint: string; flavor?: string };

const GOLD = colors.rankGold;

const LOOKS: Record<string, BadgeLook> = {
  // ---- achievements (id = achievementId) ----
  perfectWeek: { emoji: '🌟', tint: '#E9B542', flavor: '95%+ adherence in one week' },
  streakLord8: { emoji: '🔥', tint: '#E86A4A', flavor: '8 completed weeks in a row' },
  streakLord12: { emoji: '⚡', tint: '#E8C84A', flavor: '12 completed weeks in a row' },
  hardMode4: { emoji: '😤', tint: '#9B59B6', flavor: '4 completed weeks at max difficulty' },
  goalCrusher: { emoji: '🎯', tint: '#4ADE80', flavor: 'Finished a weight goal' },
  marathonWeek: { emoji: '🏃', tint: '#38BDF8', flavor: '600+ training minutes in one week' },
  comeback: { emoji: '🦅', tint: '#F472B6', flavor: 'Full week right after a missed one' },
  // ---- daily-streak milestones (id = streakDays<N>), career badges ----
  streakDays30: { emoji: '🔥', tint: GOLD, flavor: '30 days without breaking the chain' },
  streakDays50: { emoji: '🔥', tint: GOLD, flavor: '50-day streak' },
  streakDays100: { emoji: '💯', tint: GOLD, flavor: '100-day streak' },
  streakDays150: { emoji: '🌋', tint: '#E86A4A', flavor: '150-day streak' },
  streakDays200: { emoji: '☄️', tint: '#E86A4A', flavor: '200-day streak' },
  streakDays365: { emoji: '🗓️', tint: '#C084FC', flavor: 'A full year' },
  // ---- tier badges (id = reached-<Tier>) ----
  'reached-Bronze': { emoji: '🥉', tint: '#CD7F32' },
  'reached-Silver': { emoji: '🥈', tint: '#B8C4D0' },
  'reached-Gold': { emoji: '🥇', tint: GOLD },
  'reached-Platinum': { emoji: '🔷', tint: '#67E8F9' },
  'reached-Diamond': { emoji: '💎', tint: '#818CF8' },
  'reached-Master': { emoji: '👑', tint: '#C084FC' },
  'reached-Challenger': { emoji: '🏆', tint: '#F87171' },
  // ---- season records ----
  seasonRank: { emoji: '🏅', tint: GOLD },
  seasonPeak: { emoji: '🏔️', tint: '#93C5FD' },
};

const FALLBACK: BadgeLook = { emoji: '🏅', tint: GOLD };

/** Look up by achievementId / badge kind; never fails. */
export function badgeLook(key: string | null | undefined): BadgeLook {
  return (key && LOOKS[key]) || FALLBACK;
}

/** Key for a badgesPublic entry (mirrors carry {id,type,label}). */
export function lookKeyForPublicBadge(b: { id: string; type: string }): string {
  if (b.type === 'seasonRank' || b.type === 'seasonPeak') return b.type;
  // achievement docs are `${seasonId}-achv-<achievementId>` or `achv-<id>`
  const m = /achv-([A-Za-z0-9-]+)$/.exec(b.id);
  return m ? m[1]! : b.id;
}
