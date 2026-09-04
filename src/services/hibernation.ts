import { getFunctions, httpsCallable } from 'firebase/functions';

import { firebaseApp } from '../firebase/firebase';
import { DEFAULT_TZ, nextIsoWeekId } from '../mmr/time';

/**
 * Hibernation: a multi-week penalty shield for a real absence (deployment,
 * injury, a long trip). Same scoring effect as a vacation week, but spanning a
 * range and granted by the server — the range drives scoring, so the client
 * only ever ASKS (rules deny the field outright).
 *
 * Vacation stays what it is: a 2-per-season, one-week valve you toggle
 * yourself. Hibernation is the month-long case vacation can't cover.
 */

export const HIBERNATION_MIN_WEEKS = 2;
export const HIBERNATION_MAX_WEEKS = 12;

export type PublicHibernation = {
  hibernatingFromWeekId?: string | null;
  hibernatingUntilWeekId?: string | null;
};

/** Is this public profile asleep for the given week? */
export function isHibernating(pub: PublicHibernation | null | undefined, weekId: string): boolean {
  const from = pub?.hibernatingFromWeekId;
  const until = pub?.hibernatingUntilWeekId;
  if (!from || !until) return false;
  return weekId >= from && weekId <= until;
}

/**
 * Every ISO week in which this member is shielded — booked vacation or
 * hibernation — from the public mirror. Used by the DAILY streak: a shielded
 * week's days neither add to nor break the chain, matching what the server
 * already does for the WEEK streak. Without this the "39d" chip reset to 0 on
 * day three of a booked vacation (prod 2026-09-04) while streakWeeks held.
 */
export function shieldedWeekIds(pub: {
  vacationFromWeekId?: string | null;
  vacationUntilWeekId?: string | null;
  hibernatingFromWeekId?: string | null;
  hibernatingUntilWeekId?: string | null;
} | null | undefined): Set<string> {
  const out = new Set<string>();
  const walk = (from?: string | null, until?: string | null) => {
    if (!from || !until || from > until) return;
    let w = from;
    for (let i = 0; i < 60 && w <= until; i += 1) {
      out.add(w);
      w = nextIsoWeekId(w, DEFAULT_TZ);
    }
  };
  walk(pub?.vacationFromWeekId, pub?.vacationUntilWeekId);
  walk(pub?.hibernatingFromWeekId, pub?.hibernatingUntilWeekId);
  return out;
}

export async function setHibernation(params: {
  weeks: number;
  reason?: string | null;
  /** Group admins may set this for a member who left before doing it. */
  targetUid?: string;
}): Promise<{ fromWeekId: string; untilWeekId: string }> {
  const fn = httpsCallable(getFunctions(firebaseApp as any), 'setHibernation');
  const res = await fn({ weeks: params.weeks, reason: params.reason ?? null, targetUid: params.targetUid });
  return res.data as { fromWeekId: string; untilWeekId: string };
}

export async function clearHibernation(targetUid?: string): Promise<void> {
  const fn = httpsCallable(getFunctions(firebaseApp as any), 'setHibernation');
  await fn({ clear: true, targetUid });
}
