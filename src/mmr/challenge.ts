import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz, nextIsoWeekId, zonedNoonUtcFromYmd } from './time';

/**
 * Pure Challenge math (no Firebase) so it's unit-testable. The Firestore
 * read/write wrappers live in services/challenges.ts and re-export these.
 *
 * A "Challenge" is a group-wide, fixed-duration shared timeline the owner sets
 * so every member is on the same clock — a comparison LENS over the existing
 * weekly scoring, not a separate rank ladder.
 */
export type GroupChallenge = {
  name: string;
  /** ISO week id the challenge starts on (Monday-aligned by construction). */
  startWeekId: string;
  durationWeeks: number;
  status: 'active' | 'ended';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ChallengePhase = 'upcoming' | 'active' | 'ended';

export type ChallengeProgress = {
  phase: ChallengePhase;
  /** 1-based current week within the challenge (0 before it starts). */
  week: number;
  total: number;
  weekIds: string[];
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string; // YYYY-MM-DD (Sunday of the final week)
};

/** The ISO week id a chosen start date falls in (this is the Monday-snap). */
export function weekIdForDate(dateYmd: string, tz: string = DEFAULT_TZ): string {
  return isoWeekIdInTz(zonedNoonUtcFromYmd(dateYmd, tz), tz);
}

/** The ordered list of week ids a challenge spans. */
export function challengeWeekIds(startWeekId: string, durationWeeks: number, tz: string = DEFAULT_TZ): string[] {
  const ids: string[] = [];
  let w = startWeekId;
  const n = Math.max(1, Math.round(durationWeeks));
  for (let i = 0; i < n; i += 1) {
    ids.push(w);
    w = nextIsoWeekId(w, tz);
  }
  return ids;
}

/** Where a challenge stands right now (phase + current week + date bounds). */
export function challengeProgress(challenge: GroupChallenge, now: Date = new Date(), tz: string = DEFAULT_TZ): ChallengeProgress {
  const weekIds = challengeWeekIds(challenge.startWeekId, challenge.durationWeeks, tz);
  const startDate = isoWeekRangeInTz(weekIds[0]!, tz).start;
  const endDate = isoWeekRangeInTz(weekIds[weekIds.length - 1]!, tz).end;
  const cur = isoWeekIdInTz(now, tz);
  const total = weekIds.length;

  if (challenge.status === 'ended') {
    return { phase: 'ended', week: total, total, weekIds, startDate, endDate };
  }
  // Week ids sort lexicographically in chronological order (YYYY-Www, zero-padded).
  if (cur < weekIds[0]!) return { phase: 'upcoming', week: 0, total, weekIds, startDate, endDate };
  const idx = weekIds.indexOf(cur);
  if (idx === -1) return { phase: 'ended', week: total, total, weekIds, startDate, endDate };
  return { phase: 'active', week: idx + 1, total, weekIds, startDate, endDate };
}

/** Days an ended challenge stays on the Today card before it goes quiet. */
export const CHALLENGE_LINGER_DAYS = 7;

/**
 * Should the Today card still show this challenge? Upcoming and active: yes.
 * Ended: only for CHALLENGE_LINGER_DAYS after the finish, so the standings
 * get their victory lap and then clear the deck until the next one starts.
 * (The Group info row still opens the old standings any time.)
 */
export function isChallengeVisible(challenge: GroupChallenge, now: Date = new Date(), tz: string = DEFAULT_TZ): boolean {
  const p = challengeProgress(challenge, now, tz);
  if (p.phase !== 'ended') return true;
  // Ended early by the owner: linger from the moment they ended it, not
  // from the scheduled last Sunday.
  const endedAt = challenge.status === 'ended' ? (challenge.updatedAt as any)?.toDate?.() : null;
  const finish = endedAt instanceof Date ? endedAt : zonedNoonUtcFromYmd(p.endDate, tz);
  const hideAfter = finish.getTime() + CHALLENGE_LINGER_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= hideAfter;
}
