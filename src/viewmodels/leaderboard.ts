import type { GroupLog, LogType } from '../services/logs';
import type { PublicUser } from '../services/publicUsers';
import type { Tier } from '../mmr/types';
import { computeStreakDays } from './today';
import { friendlyNameFromDisplayName } from '../utils/formatters';

export type Division = 1 | 2 | 3 | 4;

export type Movement = 'up' | 'down' | 'same';

export type LeaderboardRow = {
  rank: number;
  /** True when one or more other rows share this exact rank (equal MMR). */
  isTied: boolean;
  uid: string;
  name: string;
  photoURL: string | null;
  tier: Tier | null;
  division: Division | null;
  mmr: number | null;
  streakDays: number;
  atRisk: boolean;
  isMe: boolean;
  /** Week-over-week MMR movement; null when no prior-week snapshot exists yet. */
  movement: Movement | null;
};

export type LeaderboardData = {
  rows: LeaderboardRow[];
  gapToTop: number | null; // my MMR gap to #1 (null if I'm #1 or unknown)
  /** The member directly ahead of me and the FP to overtake them (null if I'm #1). */
  rival: { name: string; gap: number } | null;
  /** When I'm #1: the closest chaser and my lead over them (null otherwise). */
  chaser: { name: string; lead: number } | null;
};

const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
function asTier(x: unknown): Tier | null {
  const s = String(x ?? '').trim();
  return (TIERS as string[]).includes(s) ? (s as Tier) : null;
}

/** Full group leaderboard ranked by global MMR, with streaks, at-risk state, and my gap to #1. */
export function buildLeaderboard(params: {
  memberUids: string[];
  publicUsers: Record<string, PublicUser>;
  canSee: Set<string>;
  myUid: string;
  logs: GroupLog[];
  today: string;
  streakRule: 'workout' | 'any';
  pastCutoff: boolean;
}): LeaderboardData {
  const { memberUids, publicUsers, canSee, myUid, logs, today, streakRule, pastCutoff } = params;
  const allowed = memberUids.filter((u) => u === myUid || canSee.has(u));

  const allowedTypes: Set<LogType> =
    streakRule === 'any' ? new Set<LogType>(['calories', 'workout', 'weight', 'photo']) : new Set<LogType>(['workout']);
  const loggedToday = new Set<string>();
  for (const l of logs) {
    if (l.date === today && allowedTypes.has(l.type)) loggedToday.add(l.uid);
  }
  const streaks = computeStreakDays(logs, allowedTypes, today);

  const rows = allowed
    .filter((uid) => publicUsers[uid])
    .map((uid) => {
      const p = publicUsers[uid];
      const mmr = typeof p?.mmrPublic === 'number' ? p.mmrPublic : null;
      const prev = typeof p?.prevMmrPublic === 'number' ? p.prevMmrPublic : null;
      const movement: Movement | null = mmr == null || prev == null ? null : mmr > prev ? 'up' : mmr < prev ? 'down' : 'same';
      return {
        uid,
        name: friendlyNameFromDisplayName(p?.displayName ?? null, uid),
        photoURL: p?.photoURL ?? null,
        tier: asTier(p?.rankTierPublic),
        division: (typeof p?.rankDivisionPublic === 'number' ? p.rankDivisionPublic : null) as Division | null,
        mmr,
        streakDays: streaks[uid] ?? 0,
        atRisk: !loggedToday.has(uid) && pastCutoff,
        isMe: uid === myUid,
        movement,
      };
    });

  // Stable secondary order by name (so ties don't reshuffle between reloads),
  // but the RANK NUMBER itself uses standard competition ranking (1224): equal
  // MMR shares the same rank, and the next distinct MMR skips to its true
  // position (e.g. two people tied at #1, next person is #3 — not #2).
  rows.sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1) || a.name.localeCompare(b.name));
  const ranks: number[] = rows.map((r, i) => (i > 0 && r.mmr === rows[i - 1].mmr ? -1 : i + 1));
  for (let i = 0; i < ranks.length; i += 1) if (ranks[i] === -1) ranks[i] = ranks[i - 1]!;
  const ranked: LeaderboardRow[] = rows.map((r, i) => ({
    rank: ranks[i]!,
    isTied: (i > 0 && ranks[i] === ranks[i - 1]) || (i < ranks.length - 1 && ranks[i] === ranks[i + 1]),
    ...r,
  }));

  const topMmr = ranked[0]?.mmr ?? null;
  const myIndex = ranked.findIndex((r) => r.isMe);
  const me = myIndex >= 0 ? ranked[myIndex] : undefined;
  const gapToTop =
    me && me.rank > 1 && topMmr != null && me.mmr != null ? Math.max(0, Math.round(topMmr - me.mmr)) : null;

  // Closest rival: the first person above me with a strictly higher MMR (skip
  // anyone tied with me — you don't "overtake" a tie, you break it by pulling ahead).
  let rival: { name: string; gap: number } | null = null;
  if (me && me.mmr != null) {
    for (let i = myIndex - 1; i >= 0; i -= 1) {
      const r = ranked[i]!;
      if (r.mmr != null && r.mmr > me.mmr) {
        rival = { name: r.name, gap: Math.max(1, Math.round(r.mmr - me.mmr)) };
        break;
      }
    }
  }

  // When I'm #1, show my lead over the closest chaser below me instead.
  let chaser: { name: string; lead: number } | null = null;
  if (me && me.rank === 1 && me.mmr != null) {
    for (let i = myIndex + 1; i < ranked.length; i += 1) {
      const r = ranked[i]!;
      if (r.mmr != null && r.mmr < me.mmr) {
        chaser = { name: r.name, lead: Math.max(0, Math.round(me.mmr - r.mmr)) };
        break;
      }
    }
  }

  return { rows: ranked, gapToTop, rival, chaser };
}
