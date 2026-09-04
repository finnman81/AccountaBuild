import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { computeGoalStreak } from '../viewmodels/today';
import type { GroupLog } from './logs';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../mmr/time';
import { shieldedWeekIds } from './hibernation';

/**
 * Accurate self-streak, mirrored to publicUsers.
 *
 * WHY: every screen used to derive streaks from the group's newest-300 log
 * feed. With the whole crew logging ~20x/day that window now reaches back only
 * ~2 weeks, so any streak longer than the window got TRUNCATED (prod 2026-07-24:
 * Jake's 18-day streak "dropped" to 13 — it never broke, the lookback shrank).
 *
 * Fix: each client computes its OWN streak from a complete uid-scoped query
 * (uid+date composite index, ~120-day lookback) and mirrors the number to
 * publicUsers/{uid}.streakDaysPublic. Teammates' rails take
 * max(windowStreak, fresh mirror) — the window can only ever undercount, so
 * max() is always safe, and a >48h-stale mirror is ignored (its owner hasn't
 * been in the app; the window value is then the honest one).
 *
 * streakDaysUpdatedAtMs is a plain number (not a Timestamp) on purpose: the
 * publicUsers map rides the hydration cache through JSON.
 */
const LOOKBACK_DAYS = 120;

export async function computeAndMirrorMyStreak(uid: string, groupId: string): Promise<number | null> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
    const minDate = yyyyMmDdInTz(cutoff, DEFAULT_TZ);

    const [groupSnap, pubSnap, logsSnap] = await Promise.all([
      getDoc(doc(db, 'groups', groupId)),
      getDoc(doc(db, 'publicUsers', uid)),
      getDocs(query(collection(db, 'groups', groupId, 'logs'), where('uid', '==', uid), where('date', '>=', minDate))),
    ]);

    const streakRule = ((groupSnap.data() as any)?.streakRule ?? 'any') as 'workout' | 'any';
    const p = (pubSnap.data() as any) ?? {};
    const logs = logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) })) as GroupLog[];

    const streak = computeGoalStreak({
      logs,
      uid,
      today: yyyyMmDdInTz(new Date(), DEFAULT_TZ),
      streakRule,
      targets: {
        workout: Number(p?.workoutsPerWeek ?? 0),
        calories: Number(p?.logCaloriesDaysPerWeek ?? 0),
        weight: Number(p?.logWeightDaysPerWeek ?? 0),
      },
      shieldedWeeks: shieldedWeekIds(p),
    });

    await setDoc(
      doc(db, 'publicUsers', uid),
      { streakDaysPublic: streak, streakDaysUpdatedAtMs: Date.now(), updatedAt: serverTimestamp() },
      { merge: true },
    );
    return streak;
  } catch {
    return null; // display-only mirror; the windowed value still renders
  }
}

// NOTE: the read-side blend (bestStreak) lives in viewmodels/today.ts — this
// module imports computeGoalStreak from there, so the dependency must stay
// one-directional.
