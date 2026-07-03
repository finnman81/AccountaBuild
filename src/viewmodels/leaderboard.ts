import type { GroupLog, LogType } from '../services/logs';
import type { PublicUser } from '../services/publicUsers';
import type { Tier } from '../mmr/types';
import { computeStreakDays } from './today';
import { friendlyNameFromDisplayName } from '../utils/formatters';

export type Division = 1 | 2 | 3 | 4;

export type Movement = 'up' | 'down' | 'same';

export type LeaderboardRow = {
  rank: number;
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

  rows.sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1) || a.name.localeCompare(b.name));
  const ranked: LeaderboardRow[] = rows.map((r, i) => ({ rank: i + 1, ...r }));

  const topMmr = ranked[0]?.mmr ?? null;
  const me = ranked.find((r) => r.isMe);
  const gapToTop =
    me && me.rank > 1 && topMmr != null && me.mmr != null ? Math.max(0, Math.round(topMmr - me.mmr)) : null;

  return { rows: ranked, gapToTop };
}
