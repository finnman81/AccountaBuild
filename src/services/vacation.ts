import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { DEFAULT_TZ, isoWeekIdInTz, seasonIdFromDate } from '../mmr/time';

/**
 * Vacation mode: a user-declared "this week can't hurt me" flag on the CURRENT
 * ISO week only (never retroactive — a closed week stays closed).
 *
 * Scoring effect (both scorers): no missed/partial penalty, streak held, no
 * freeze spent; anything logged still scores normally. Capped per season so
 * it stays a real-life valve, not a standing exemption.
 */
export const VACATION_WEEKS_PER_SEASON = 2;

export type VacationState = {
  weekId: string;
  seasonId: string;
  onVacationThisWeek: boolean;
  usedThisSeason: number;
  remaining: number;
};

export async function getVacationState(uid: string): Promise<VacationState> {
  const now = new Date();
  const weekId = isoWeekIdInTz(now, DEFAULT_TZ);
  const seasonId = seasonIdFromDate(now, DEFAULT_TZ);
  const [weekSnap, userSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'weekly', weekId)),
    getDoc(doc(db, 'users', uid)),
  ]);
  const onVacationThisWeek = weekSnap.exists() && (weekSnap.data() as any)?.vacation === true;
  const used = Number((userSnap.data() as any)?.vacationUsed?.[seasonId]) || 0;
  return {
    weekId,
    seasonId,
    onVacationThisWeek,
    usedThisSeason: used,
    remaining: Math.max(0, VACATION_WEEKS_PER_SEASON - used),
  };
}

/**
 * Toggle vacation for the CURRENT week. Turning it on consumes one seasonal
 * allowance; turning it back off (same week, before close) refunds it.
 * Returns the new state; throws if enabling with no allowance left.
 */
export async function setVacationForCurrentWeek(uid: string, on: boolean): Promise<VacationState> {
  const state = await getVacationState(uid);
  if (on === state.onVacationThisWeek) return state;
  if (on && state.remaining <= 0) throw new Error('No vacation weeks left this season.');

  const delta = on ? 1 : -1;
  await setDoc(
    doc(db, 'users', uid, 'weekly', state.weekId),
    { vacation: on, vacationSetAt: serverTimestamp() },
    { merge: true },
  );
  await setDoc(
    doc(db, 'users', uid),
    { vacationUsed: { [state.seasonId]: Math.max(0, state.usedThisSeason + delta) } },
    { merge: true },
  );
  // Public mirror so teammates see the 🏖️ on the leaderboard instead of
  // wondering why a row is frozen.
  await setDoc(doc(db, 'publicUsers', uid), { vacationWeekId: on ? state.weekId : null }, { merge: true }).catch(() => {});

  return { ...state, onVacationThisWeek: on, usedThisSeason: Math.max(0, state.usedThisSeason + delta), remaining: Math.max(0, state.remaining - delta) };
}
