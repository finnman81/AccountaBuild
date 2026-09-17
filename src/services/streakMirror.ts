import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import { getFunctions, httpsCallable } from 'firebase/functions';

import { db, firebaseApp } from '../firebase/firebase';
import { computeGoalStreak, streakWeekStates } from '../viewmodels/today';
import type { GroupLog } from './logs';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../mmr/time';
import { shieldedWeekIds } from '../mmr/shields';

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

/** Everything the streak math needs, from one complete uid-scoped read. */
async function loadMyStreakInputs(uid: string, groupId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const minDate = yyyyMmDdInTz(cutoff, DEFAULT_TZ);

  const [groupSnap, pubSnap, logsSnap] = await Promise.all([
    getDoc(doc(db, 'groups', groupId)),
    getDoc(doc(db, 'publicUsers', uid)),
    getDocs(query(collection(db, 'groups', groupId, 'logs'), where('uid', '==', uid), where('date', '>=', minDate))),
  ]);

  const p = (pubSnap.data() as any) ?? {};
  return {
    logs: logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) })) as GroupLog[],
    uid,
    today: yyyyMmDdInTz(new Date(), DEFAULT_TZ),
    streakRule: ((groupSnap.data() as any)?.streakRule ?? 'any') as 'workout' | 'any',
    targets: {
      workout: Number(p?.workoutsPerWeek ?? 0),
      calories: Number(p?.logCaloriesDaysPerWeek ?? 0),
      weight: Number(p?.logWeightDaysPerWeek ?? 0),
    },
    shieldedWeeks: shieldedWeekIds(p),
    // Seeded from the current mirror so the first write can't record a best of 0.
    bestSoFar: Math.max(Number(p?.bestStreakDaysPublic) || 0, Number(p?.streakDaysPublic) || 0),
  };
}

export async function computeAndMirrorMyStreak(uid: string, groupId: string): Promise<number | null> {
  try {
    const inputs = await loadMyStreakInputs(uid, groupId);
    const streak = computeGoalStreak(inputs);
    // Best-ever rides along: a broken streak should still leave a record.
    const best = Math.max(streak, inputs.bestSoFar);
    await setDoc(
      doc(db, 'publicUsers', uid),
      { streakDaysPublic: streak, bestStreakDaysPublic: best, streakDaysUpdatedAtMs: Date.now(), updatedAt: serverTimestamp() },
      { merge: true },
    );
    return streak;
  } catch {
    return null; // display-only mirror; the windowed value still renders
  }
}

export type MyStreakMoment = {
  streak: number;
  /** Longest streak on record (includes the current one). */
  best: number;
  loggedToday: boolean;
  week: ReturnType<typeof streakWeekStates>;
};

/** Streak + this week's row for the daily celebration. Null on any failure. */
export async function loadMyStreakMoment(uid: string, groupId: string): Promise<MyStreakMoment | null> {
  try {
    const inputs = await loadMyStreakInputs(uid, groupId);
    const week = streakWeekStates(inputs);
    const streak = computeGoalStreak(inputs);
    return {
      streak,
      best: Math.max(streak, inputs.bestSoFar),
      loggedToday: week.some((d) => d.date === inputs.today && d.state === 'logged'),
      week,
    };
  } catch {
    return null;
  }
}

// NOTE: the read-side blend (bestStreak) lives in viewmodels/today.ts — this
// module imports computeGoalStreak from there, so the dependency must stay
// one-directional.

/** Tell the server a milestone landed (chat line; 30+ also pop-up, push, badge). Fire and forget. */
export async function announceStreakMilestone(milestone: number): Promise<void> {
  try {
    await httpsCallable(getFunctions(firebaseApp as any), 'streakMilestone')({ milestone });
  } catch {
    /* the moment on screen already happened; the group line is best-effort */
  }
}
