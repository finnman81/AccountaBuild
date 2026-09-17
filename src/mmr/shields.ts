import { DEFAULT_TZ, nextIsoWeekId } from './time';

/**
 * Shield ranges (vacation + hibernation) read off the public mirror. Pure: no
 * Firebase imports, so viewmodels and unit tests can load this freely.
 */
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
  vacationWeekIds?: string[] | null;
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
  // The full booked list survives later bookings/cancels; the range alone
  // only ever described the latest booking.
  for (const w of pub?.vacationWeekIds ?? []) out.add(w);
  walk(pub?.vacationFromWeekId, pub?.vacationUntilWeekId);
  walk(pub?.hibernatingFromWeekId, pub?.hibernatingUntilWeekId);
  return out;
}

