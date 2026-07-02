import type { GroupLog, LogType } from '../services/logs';
import type { PublicUser } from '../services/publicUsers';
import type { Tier } from '../mmr/types';
import { computeStreakDays } from './today';
import { friendlyNameFromDisplayName } from '../utils/formatters';

export type Division = 1 | 2 | 3 | 4;

export type GroupAvatar = { uid: string; name: string; photoURL: string | null; logged: boolean };

export type GroupOverview = {
  compliancePct: number; // 0-100, weekly
  loggedToday: number;
  memberTotal: number;
  streakDays: number; // mine, in this group
  myTier: Tier | null;
  myDivision: Division | null;
  avatars: GroupAvatar[];
};

const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
function asTier(x: unknown): Tier | null {
  const s = String(x ?? '').trim();
  return (TIERS as string[]).includes(s) ? (s as Tier) : null;
}

/**
 * Weekly compliance for a group's ring: logged-days ÷ (members × days-elapsed)
 * this ISO week, as a 0-100 percentage. A member counts as "logged" for a day
 * if they have any log dated that day. `elapsedDates` should already be trimmed
 * to today (the caller passes only week dates up to and including today).
 */
export function buildGroupCompliancePct(
  logs: GroupLog[],
  memberUids: string[],
  elapsedDates: string[],
): number {
  const members = new Set(memberUids);
  const denom = members.size * elapsedDates.length;
  if (denom <= 0) return 0;

  const elapsed = new Set(elapsedDates);
  const pairs = new Set<string>();
  for (const l of logs) {
    if (!l?.uid || !l?.date) continue;
    if (!members.has(l.uid) || !elapsed.has(l.date)) continue;
    pairs.add(`${l.uid}|${l.date}`);
  }
  return Math.round((100 * pairs.size) / denom);
}

/** Everything a Groups-list card needs, derived from a group's members + logs + public users. */
export function buildGroupOverview(params: {
  logs: GroupLog[];
  memberUids: string[];
  publicUsers: Record<string, PublicUser>;
  myUid: string;
  today: string;
  elapsedDates: string[];
  streakRule: 'workout' | 'any';
  maxAvatars?: number;
}): GroupOverview {
  const { logs, memberUids, publicUsers, myUid, today, elapsedDates, streakRule } = params;

  const allowedTypes: Set<LogType> =
    streakRule === 'any' ? new Set<LogType>(['calories', 'workout', 'weight', 'photo']) : new Set<LogType>(['workout']);

  const loggedTodayByUid = new Set<string>();
  for (const l of logs) {
    if (l.date === today && allowedTypes.has(l.type)) loggedTodayByUid.add(l.uid);
  }

  const streaks = computeStreakDays(logs, allowedTypes, today);
  const me = publicUsers[myUid];

  const avatars: GroupAvatar[] = memberUids
    .map((uid) => ({
      uid,
      name: friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid),
      photoURL: publicUsers[uid]?.photoURL ?? null,
      logged: loggedTodayByUid.has(uid),
    }))
    .sort((a, b) => {
      if (a.uid === myUid) return -1;
      if (b.uid === myUid) return 1;
      if (a.logged !== b.logged) return a.logged ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, params.maxAvatars ?? 5);

  return {
    compliancePct: buildGroupCompliancePct(logs, memberUids, elapsedDates),
    loggedToday: loggedTodayByUid.size,
    memberTotal: memberUids.length,
    streakDays: streaks[myUid] ?? 0,
    myTier: asTier(me?.rankTierPublic),
    myDivision: (typeof me?.rankDivisionPublic === 'number' ? me.rankDivisionPublic : null) as Division | null,
    avatars,
  };
}
