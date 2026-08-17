import { getFunctions, httpsCallable } from 'firebase/functions';

import { firebaseApp } from '../firebase/firebase';

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
