import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { DEFAULT_TZ, isoWeekIdInTz, nextIsoWeekId, seasonIdFromDate } from '../mmr/time';

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
 * so the scorer needed no change and closed weeks are still untouchable.
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
  const seasonId = seasonIdFromDate(now, DEFAULT_TZ);
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

  const batch = writeBatch(db);
  for (const w of wanted) {
    batch.set(doc(db, 'users', uid, 'weekly', w), { vacation: true, vacationSetAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  await setDoc(doc(db, 'users', uid), { vacationUsed: { [state.seasonId]: state.usedThisSeason + wanted.length } }, { merge: true });
  await mirrorPublic(uid, [...state.bookedWeekIds, ...wanted]);
  return getVacationState(uid);
}

/** Cancel every booked week from `fromWeekId` forward, refunding the allowance. */
export async function cancelVacation(uid: string, fromWeekId?: string): Promise<VacationState> {
  const state = await getVacationState(uid);
  const from = fromWeekId ?? state.weekId;
  const toClear = state.bookedWeekIds.filter((w) => w >= from);
  if (!toClear.length) return state;

  const batch = writeBatch(db);
  for (const w of toClear) {
    batch.set(doc(db, 'users', uid, 'weekly', w), { vacation: false, vacationSetAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  await setDoc(
    doc(db, 'users', uid),
    { vacationUsed: { [state.seasonId]: Math.max(0, state.usedThisSeason - toClear.length) } },
    { merge: true },
  );
  await mirrorPublic(uid, state.bookedWeekIds.filter((w) => w < from));
  return getVacationState(uid);
}

/**
 * Public mirror so teammates see 🏖️ instead of wondering why a row is frozen.
 * Range fields match the hibernation mirror's shape; vacationWeekId is kept for
 * bundles that predate the range.
 */
async function mirrorPublic(uid: string, booked: string[]): Promise<void> {
  const sorted = [...new Set(booked)].sort();
  const nowWeek = isoWeekIdInTz(new Date(), DEFAULT_TZ);
  await setDoc(
    doc(db, 'publicUsers', uid),
    {
      vacationFromWeekId: sorted[0] ?? null,
      vacationUntilWeekId: sorted[sorted.length - 1] ?? null,
      vacationWeekId: sorted.includes(nowWeek) ? nowWeek : null,
    },
    { merge: true },
  ).catch(() => {});
}

/** Back-compat for the Today prompt: toggle just the current week. */
export async function setVacationForCurrentWeek(uid: string, on: boolean): Promise<VacationState> {
  const state = await getVacationState(uid);
  return on ? bookVacation(uid, state.weekId, 1) : cancelVacation(uid, state.weekId);
}
