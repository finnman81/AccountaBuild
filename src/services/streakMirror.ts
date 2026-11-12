import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import { getFunctions, httpsCallable } from 'firebase/functions';

import { db, firebaseApp } from '../firebase/firebase';
import { computeGoalStreakDetail, streakWeekStates } from '../viewmodels/today';
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
const MAX_LOOKBACK_DAYS = 1500;

/** Everything the streak math needs, from one complete uid-scoped read. */
async function loadMyStreakInputs(uid: string, groupId: string, lookbackDays = LOOKBACK_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const minDate = yyyyMmDdInTz(cutoff, DEFAULT_TZ);

  // The streak is the PERSON's, not the group's: read my logs from every group
  // I'm in. Reading only the active group made a new second group show "Day 1"
  // with Wed-Fri missed for someone on an 88-day streak.
  const myGroups = await getDocs(collection(db, 'users', uid, 'groups')).catch(() => null);
  // Any failed read means logs may be missing, and missing logs read as a
  // shorter (or dead) streak. The callers refuse to LOWER the number on that.
  let partial = !myGroups;
  const groupIds = Array.from(new Set([
    groupId,
    ...(myGroups?.docs ?? []).map((d) => String((d.data() as any)?.groupId ?? d.id)).filter(Boolean),
  ]));
  const [pubSnap, groupSnaps, logSnaps] = await Promise.all([
    getDoc(doc(db, 'publicUsers', uid)),
    Promise.all(groupIds.map((gid) => getDoc(doc(db, 'groups', gid)).catch(() => null))),
    Promise.all(groupIds.map((gid) =>
      getDocs(query(collection(db, 'groups', gid, 'logs'), where('uid', '==', uid), where('date', '>=', minDate))).catch(() => null),
    )),
  ]);
  const logsById = new Map<string, GroupLog>();
  if (logSnaps.some((s) => !s)) partial = true;
  for (const snap of logSnaps) {
    for (const d of snap?.docs ?? []) {
      if (!logsById.has(d.id)) logsById.set(d.id, { id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) } as GroupLog);
    }
  }
  // Workout-only only if every group asks for it; one 'any' group means any log counts.
  const rules = groupSnaps.map((g) => ((g?.data() as any)?.streakRule ?? 'any') as string);
  const streakRule: 'workout' | 'any' = rules.length && rules.every((r) => r === 'workout') ? 'workout' : 'any';

  const p = (pubSnap.data() as any) ?? {};
  return {
    logs: [...logsById.values()],
    uid,
    today: yyyyMmDdInTz(new Date(), DEFAULT_TZ),
    streakRule,
    targets: {
      workout: Number(p?.workoutsPerWeek ?? 0),
      calories: Number(p?.logCaloriesDaysPerWeek ?? 0),
      weight: Number(p?.logWeightDaysPerWeek ?? 0),
    },
    shieldedWeeks: shieldedWeekIds(p),
    windowStart: minDate,
    partial,
    mirrorNow: Number(p?.streakDaysPublic) || 0,
    // Seeded from the current mirror so the first write can't record a best of 0.
    bestSoFar: Math.max(Number(p?.bestStreakDaysPublic) || 0, Number(p?.streakDaysPublic) || 0),
  };
}

/**
 * A chain still alive at the window's start may run further back: widen and
 * recount. The old test (streak >= lookback - 7) compared LOGGED days with
 * CALENDAR days, so rest and vacation days hid the edge (Jake 11/12: real
 * chain back to 7/5, read began 7/15, streak slid 111 -> 110).
 */
const lookbackByUid = new Map<string, number>(); // skip the short first read once a long chain is known

async function loadFullStreak(uid: string, groupId: string) {
  let lookback = lookbackByUid.get(uid) ?? LOOKBACK_DAYS;
  let inputs = await loadMyStreakInputs(uid, groupId, lookback);
  let r = computeGoalStreakDetail(inputs);
  while (r.hitEdge && lookback < MAX_LOOKBACK_DAYS) {
    lookback = Math.min(lookback * 2, MAX_LOOKBACK_DAYS);
    inputs = await loadMyStreakInputs(uid, groupId, lookback);
    r = computeGoalStreakDetail(inputs);
  }
  lookbackByUid.set(uid, lookback);
  // A read failed and the count came out lower than the mirror: do not trust it.
  if (inputs.partial && r.streak < inputs.mirrorNow) throw new Error('streak: partial read');
  return { inputs, streak: r.streak };
}

export async function computeAndMirrorMyStreak(uid: string, groupId: string): Promise<number | null> {
  try {
    const { inputs, streak } = await loadFullStreak(uid, groupId);
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
    const { inputs, streak } = await loadFullStreak(uid, groupId);
    const week = streakWeekStates(inputs);
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
