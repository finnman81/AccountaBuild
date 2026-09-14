import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { db, firebaseApp } from '../firebase/firebase';
import { DEFAULT_TZ, isoWeekDatesInTz, isoWeekIdInTz, nextIsoWeekId, seasonIdFromDate, zonedNoonUtcFromYmd } from '../mmr/time';

/**
 * Vacation mode: user-declared weeks that can't hurt you.
 *
 * Scoring effect (mmr-compute.js): no missed/partial penalty, streak held, no
 * freeze spent. Anything you DO log still scores normally — vacation is a
 * penalty shield, never a week eraser, and a week you actually complete while
 * on vacation still advances your streak.
 *
 * BOOKABLE IN ADVANCE (2026-08-21). It used to cover only the current week,
 * which meant you could never set it before leaving — you had to remember to
 * open the app mid-trip. The flag is written per-week onto users/{uid}/weekly,
 * so the scorer needed no change.
 *
 * SERVER-OWNED (2026-09-14): booking and cancelling go through the `vacation`
 * callable. Rules deny client writes to weekly docs and vacationUsed, so a
 * closed week can't be shielded after the fact and the cap can't be reset.
 */
export const VACATION_WEEKS_PER_SEASON = 2;

export type VacationState = {
  weekId: string;
  seasonId: string;
  onVacationThisWeek: boolean;
  usedThisSeason: number;
  remaining: number;
  /** Booked weeks from this week forward (includes the current week). */
  bookedWeekIds: string[];
};

/** The next `count` week ids starting at `startWeekId` (inclusive). */
export function weekIdsFrom(startWeekId: string, count: number): string[] {
  const out: string[] = [];
  let w = startWeekId;
  for (let i = 0; i < count; i += 1) {
    out.push(w);
    w = nextIsoWeekId(w, DEFAULT_TZ);
  }
  return out;
}

export async function getVacationState(uid: string): Promise<VacationState> {
  const now = new Date();
  const weekId = isoWeekIdInTz(now, DEFAULT_TZ);
  // A week is charged to the season of its MONDAY (matches the server), so
  // Oct 1-4 still reads the week's Q3 allowance.
  const seasonId = seasonIdFromDate(zonedNoonUtcFromYmd(isoWeekDatesInTz(weekId, DEFAULT_TZ)[0], DEFAULT_TZ), DEFAULT_TZ);
  const userSnap = await getDoc(doc(db, 'users', uid));
  const used = Number((userSnap.data() as any)?.vacationUsed?.[seasonId]) || 0;

  // Look ahead across the whole allowance window so the UI can show what's
  // already booked (a range can only ever be VACATION_WEEKS_PER_SEASON long).
  const horizon = weekIdsFrom(weekId, VACATION_WEEKS_PER_SEASON + 1);
  const snaps = await Promise.all(horizon.map((w) => getDoc(doc(db, 'users', uid, 'weekly', w))));
  const bookedWeekIds = horizon.filter((_, i) => snaps[i].exists() && (snaps[i].data() as any)?.vacation === true);

  return {
    weekId,
    seasonId,
    onVacationThisWeek: bookedWeekIds.includes(weekId),
    usedThisSeason: used,
    remaining: Math.max(0, VACATION_WEEKS_PER_SEASON - used),
    bookedWeekIds,
  };
}

/**
 * Book `weeks` consecutive vacation weeks starting at `startWeekId` (which must
 * be the current week or later — a closed week stays closed). Consumes that
 * many of the season's allowance.
 */
export async function bookVacation(uid: string, startWeekId: string, weeks: number): Promise<VacationState> {
  const state = await getVacationState(uid);
  if (startWeekId < state.weekId) throw new Error("You can't put a past week on vacation.");
  const wanted = weekIdsFrom(startWeekId, weeks).filter((w) => !state.bookedWeekIds.includes(w));
  if (!wanted.length) return state;
  if (wanted.length > state.remaining) {
    throw new Error(
      state.remaining === 0
        ? 'No vacation weeks left this season.'
        : `Only ${state.remaining} vacation week${state.remaining === 1 ? '' : 's'} left this season.`,
    );
  }

  await callVacation({ action: 'book', startWeekId, weeks });
  return getVacationState(uid);
}

/** Cancel every booked week from `fromWeekId` forward, refunding the allowance. */
export async function cancelVacation(uid: string, fromWeekId?: string): Promise<VacationState> {
  const state = await getVacationState(uid);
  const from = fromWeekId ?? state.weekId;
  const toClear = state.bookedWeekIds.filter((w) => w >= from);
  if (!toClear.length) return state;

  await callVacation({ action: 'cancel', fromWeekId: from });
  return getVacationState(uid);
}

async function callVacation(data: Record<string, unknown>): Promise<void> {
  const fn = httpsCallable(getFunctions(firebaseApp as any), 'vacation');
  try {
    await fn(data);
  } catch (e: any) {
    // Surface the server's plain-English reason ("No vacation weeks left...").
    throw new Error(String(e?.message || 'Could not update vacation.'));
  }
}

/** Back-compat for the Today prompt: toggle just the current week. */
export async function setVacationForCurrentWeek(uid: string, on: boolean): Promise<VacationState> {
  const state = await getVacationState(uid);
  return on ? bookVacation(uid, state.weekId, 1) : cancelVacation(uid, state.weekId);
}
