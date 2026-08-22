import { collection, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { DEFAULT_TZ, isoWeekDatesInTz, isoWeekIdInTz, yyyyMmDdInTz } from '../mmr/time';

/**
 * "Sign your week" — a symbolic weekly commitment to the group.
 *
 * Deliberately OUTSIDE the scoring engine: nothing here is read by the scorer,
 * no FP, no penalties. Missed weeks are already punished by scoring; a
 * signature's power is social, and keeping it out of mmr-compute means it can
 * never introduce a scoring bug.
 *
 * Write-once by rule (create-only, no update/delete) — a commitment you can
 * quietly retract isn't one.
 */
export type Signature = { uid: string; weekId: string; signedOn: string };

/** Signing is open Mon–Tue only; committing on Friday means nothing. */
export const SIGN_WINDOW_DAYS = 2;

export function currentWeekId(now: Date = new Date()): string {
  return isoWeekIdInTz(now, DEFAULT_TZ);
}

/** True while the current week is still inside its signing window. */
export function signingOpen(now: Date = new Date()): boolean {
  const weekId = currentWeekId(now);
  const dates = isoWeekDatesInTz(weekId, DEFAULT_TZ);
  const today = yyyyMmDdInTz(now, DEFAULT_TZ);
  const idx = dates.indexOf(today); // 0 = Monday
  return idx >= 0 && idx < SIGN_WINDOW_DAYS;
}

/**
 * Has this person EVER signed in this group? Signature doc ids are
 * `{weekId}_{uid}`, which Firestore can't match by suffix, so this leans on
 * the uid field. One doc is enough to answer it.
 *
 * Powers the first-timer explainer: the 2026-08-19 poll found zero people
 * disliked hold-to-sign, but the one member who answered "I don't know what
 * that is" had signed 0 weeks — the feature's problem is discovery, not design.
 */
export async function hasEverSigned(groupId: string, uid: string): Promise<boolean> {
  try {
    const snap = await getDocs(
      query(collection(db, 'groups', groupId, 'signatures'), where('uid', '==', uid), limit(1)),
    );
    return !snap.empty;
  } catch {
    return true; // on error, assume yes — never show a first-timer hint wrongly
  }
}

export function subscribeWeekSignatures(
  groupId: string,
  weekId: string,
  onChange: (uids: Set<string>) => void,
  onError?: (err: unknown) => void,
) {
  const ref = query(collection(db, 'groups', groupId, 'signatures'), where('weekId', '==', weekId));
  return onSnapshot(
    ref,
    (snap) => {
      const s = new Set<string>();
      for (const d of snap.docs) {
        const uid = String((d.data() as any)?.uid ?? '').trim();
        if (uid) s.add(uid);
      }
      onChange(s);
    },
    (err) => onError?.(err),
  );
}

/**
 * Sign the current week. Doc id is `{weekId}_{uid}` — the rules require that
 * shape, so one signature per person per week is enforced by the id itself
 * rather than by a read-then-write race.
 */
export async function signCurrentWeek(groupId: string, uid: string, now: Date = new Date()): Promise<string> {
  const weekId = currentWeekId(now);
  await setDoc(doc(db, 'groups', groupId, 'signatures', `${weekId}_${uid}`), {
    uid,
    weekId,
    signedOn: yyyyMmDdInTz(now, DEFAULT_TZ),
    signedAt: serverTimestamp(),
  });
  return weekId;
}
