import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  updateDoc,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { touchGroupActivity } from './groups';
import { isValidYYYYMMDD, todayYYYYMMDD } from '../utils/dates';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../mmr/time';

export type WorkoutType =
  | 'weightLifting'
  | 'running'
  | 'jogging'
  | 'ruck'
  | 'swim'
  | 'bike'
  | 'stairMaster'
  | 'inclineWalk'
  | 'rowing'
  | 'elliptical'
  | 'hiit'
  | 'boxing'
  | 'yoga'
  | 'stretching'
  | 'meditation'
  | 'pilates'
  | 'taiChi'
  | 'tennis'
  | 'manualLabor'
  | 'walking'
  /** Anything the app can't classify — incl. Apple Health 'Other'/custom-named
   * workouts (e.g. manual labor). Better an honest 'Other' than a wrong guess. */
  | 'other';
export type LogType = 'calories' | 'workout' | 'weight' | 'photo';
export type MealType = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type GroupLog = {
  id: string;
  uid: string;
  type: LogType;
  date: string; // YYYY-MM-DD
  ts?: unknown;
  source?: 'self_reported' | 'apple_health' | 'google_fit' | 'mixed' | string;
  payload: Record<string, unknown>;
  /** Cheers/reactions on this log: uid → emoji. */
  reactions?: Record<string, string>;
  /**
   * FP this log earned at the moment it was saved (the "+N FP" toast value,
   * stamped best-effort by FpGainOverlay). Approximate by design: a log's
   * marginal FP depends on the week's pace when it lands. Absent on
   * health-synced logs and logs that moved nothing.
   */
  fpDelta?: number;
};

function normalizeLogDate(date?: string) {
  const d = (date ?? '').trim();
  return isValidYYYYMMDD(d) ? d : todayYYYYMMDD();
}

/*
 * ONE LOG, EVERY GROUP. A log belongs to the person, so it's written to every
 * group they're in under the SAME doc id: each group's feed and Team Today
 * show it, and the scorer/projection count each id once. Edits and deletes
 * follow the id to every copy. The group you logged from is written first and
 * awaited; the rest are best-effort (a failed copy never fails the save).
 */
let groupCache: { uid: string; ids: string[]; at: number } | null = null;
const GROUP_CACHE_MS = 60_000;

/** `primary` first, then my other groups. Falls back to just `primary`. */
async function myGroupIds(uid: string, primary: string): Promise<string[]> {
  if (!groupCache || groupCache.uid !== uid || Date.now() - groupCache.at > GROUP_CACHE_MS) {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'groups'));
      groupCache = { uid, ids: snap.docs.map((d) => String((d.data() as any)?.groupId ?? d.id)).filter(Boolean), at: Date.now() };
    } catch {
      return [primary];
    }
  }
  return [primary, ...groupCache.ids.filter((g) => g !== primary)];
}

/** Forget the cached group list (after joining or leaving a group). */
export function resetLogGroupCache(): void {
  groupCache = null;
}

async function addLogEverywhere(groupId: string, uid: string, data: Record<string, unknown>) {
  const ref = doc(collection(db, 'groups', groupId, 'logs'));
  await setDoc(ref, data);
  await touchGroupActivity(groupId);
  const others = (await myGroupIds(uid, groupId)).slice(1);
  await Promise.all(
    others.map((g) =>
      setDoc(doc(db, 'groups', g, 'logs', ref.id), data)
        .then(() => touchGroupActivity(g))
        .catch(() => {}),
    ),
  );
  return ref;
}

export async function addCaloriesLog(params: {
  groupId: string;
  uid: string;
  calories: number;
  meal: MealType;
  note?: string;
  date?: string; // YYYY-MM-DD
  source?: 'self_reported' | 'apple_health' | 'google_fit' | 'mixed' | string;
}) {
  return addLogEverywhere(params.groupId, params.uid, {
    uid: params.uid,
    type: 'calories',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
    source: params.source ?? 'self_reported',
    payload: {
      calories: params.calories,
      meal: params.meal,
      note: params.note?.trim() || null,
    },
  });
}

export async function addWorkoutLog(params: {
  groupId: string;
  uid: string;
  workoutType: WorkoutType;
  durationMinutes: number;
  note?: string;
  date?: string; // YYYY-MM-DD
  source?: 'self_reported' | 'apple_health' | 'google_fit' | 'mixed' | string;
}) {
  return addLogEverywhere(params.groupId, params.uid, {
    uid: params.uid,
    type: 'workout',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
    source: params.source ?? 'self_reported',
    payload: {
      workoutType: params.workoutType,
      durationMinutes: params.durationMinutes,
      note: params.note?.trim() || null,
    },
  });
}

export async function addWeightLog(params: {
  groupId: string;
  uid: string;
  weight: number;
  note?: string;
  date?: string; // YYYY-MM-DD
  source?: 'self_reported' | 'apple_health' | 'google_fit' | 'mixed' | string;
}) {
  return addLogEverywhere(params.groupId, params.uid, {
    uid: params.uid,
    type: 'weight',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
    source: params.source ?? 'self_reported',
    payload: {
      weight: params.weight,
      note: params.note?.trim() || null,
    },
  });
}

export async function addPhotoLog(params: {
  groupId: string;
  uid: string;
  url: string;
  caption?: string;
  date?: string; // YYYY-MM-DD
}) {
  return addLogEverywhere(params.groupId, params.uid, {
    uid: params.uid,
    type: 'photo',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
    source: 'self_reported',
    payload: {
      url: params.url,
      caption: params.caption?.trim() || null,
    },
  });
}

/**
 * Idempotent upsert of a log at a caller-chosen doc id (used by health sync, which
 * derives a stable id from the sample UUID so re-syncing overwrites instead of
 * duplicating). Returns the log id.
 *
 * `eventAt` (the sample's real event time) should be passed for synced logs:
 * it keeps `ts` STABLE across re-syncs and orders the log where the activity
 * actually happened. Without it, every re-sync rewrote ts=serverTimestamp(),
 * which made synced logs perpetually jump to the top of the chat feed in a
 * jumbled clump.
 */
type UpsertData = { uid: string; type: LogType; date?: string; source?: string; payload: Record<string, unknown>; eventAt?: Date };

export async function upsertGroupLogById(groupId: string, logId: string, data: UpsertData): Promise<string> {
  const groups = await myGroupIds(data.uid, groupId);
  await upsertOneGroupLog(groups[0], logId, data);
  await Promise.all(groups.slice(1).map((g) => upsertOneGroupLog(g, logId, data).catch(() => {})));
  return logId;
}

async function upsertOneGroupLog(groupId: string, logId: string, data: UpsertData): Promise<string> {
  const eventAtValid = data.eventAt instanceof Date && !Number.isNaN(data.eventAt.valueOf());
  const ref = doc(db, 'groups', groupId, 'logs', logId);
  // writtenAt must be stamped ONLY on first arrival. It was inside the merge
  // below, so every idempotent re-sync overwrote it — which made a week-old log
  // that sync merely re-touched look like it took 150h to arrive, and made the
  // measured "sync lag" meaningless (caught 2026-08-07 while investigating
  // exactly that). One existence read per synced log is cheap at this volume
  // and is the only way to distinguish first write from re-touch.
  const existing = await getDoc(ref).catch(() => null);
  const isNew = !existing?.exists();
  // The user edited this log by hand: their version wins over HealthKit.
  if ((existing?.data() as any)?.userEdited === true) return logId;
  await setDoc(
    ref,
    {
      uid: data.uid,
      type: data.type,
      date: normalizeLogDate(data.date),
      ts: eventAtValid ? Timestamp.fromDate(data.eventAt as Date) : serverTimestamp(),
      // ts is the EVENT time (stable across re-syncs); writtenAt is when the log
      // FIRST landed. The gap between them is the true sync lag.
      ...(isNew ? { writtenAt: serverTimestamp() } : {}),
      source: data.source ?? 'self_reported',
      payload: data.payload,
    },
    { merge: true },
  );
  await touchGroupActivity(groupId);
  return logId;
}

/**
 * Delete a log by id.
 *
 * `tombstone` distinguishes WHO is deleting:
 *  - USER deletes (default true): tombstone health-synced logs, or the next
 *    sync's idempotent upsert resurrects them ("I delete the extra and it
 *    comes back").
 *  - SYNC deletes (pass false): when HealthKit's anchored delta says a sample
 *    was deleted, remove the log but never tombstone. If the sample is truly
 *    gone from Health it can't re-import anyway; if HealthKit misreported
 *    (watch/phone merge artifacts — prod 2026-08-12, Jake's workout + dinner
 *    vanished), the direct-window read re-imports it next sync, which is the
 *    correct self-heal. A tombstone here turns one false report into
 *    permanent data loss.
 */
export async function deleteGroupLogById(groupId: string, logId: string, opts?: { tombstone?: boolean }): Promise<void> {
  const snap = await getDoc(doc(db, 'groups', groupId, 'logs', logId)).catch(() => null);
  const d = snap?.exists() ? (snap.data() as any) : null;
  if (opts?.tombstone !== false) {
    try {
      if (d?.uid && d?.source && d.source !== 'self_reported') {
        await setDoc(doc(db, 'users', d.uid, 'healthTombstones', logId), {
          groupId,
          type: d.type ?? null,
          date: d.date ?? null,
          deletedAt: serverTimestamp(),
        });
      }
    } catch {
      /* tombstone is best-effort; the delete below must still run */
    }
  }
  await deleteDoc(doc(db, 'groups', groupId, 'logs', logId));
  // Same id in my other groups: delete every copy.
  if (d?.uid) {
    const others = (await myGroupIds(String(d.uid), groupId)).slice(1);
    await Promise.all(others.map((g) => deleteDoc(doc(db, 'groups', g, 'logs', logId)).catch(() => {})));
  }
}

/** Apply the same field update to every copy of my log (other groups best-effort). */
export async function updateLogEverywhere(groupId: string, logId: string, uid: string, patch: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'logs', logId), patch);
  const others = (await myGroupIds(uid, groupId)).slice(1);
  await Promise.all(others.map((g) => updateDoc(doc(db, 'groups', g, 'logs', logId), patch).catch(() => {})));
}

/**
 * Stamp the FP a log earned onto the log doc (owner-only per rules). Fire and
 * forget — display data, never load-bearing for scoring.
 */
export async function setLogFpDelta(groupId: string, logId: string, fpDelta: number): Promise<void> {
  await setDoc(doc(db, 'groups', groupId, 'logs', logId), { fpDelta }, { merge: true });
}

/**
 * Toggle a reaction (cheer) on a log. Reactions are stored as a map on the log
 * doc: `reactions[uid] = emoji`. Passing null clears the current user's reaction.
 */
export async function setLogReaction(groupId: string, logId: string, uid: string, emoji: string | null): Promise<void> {
  await setDoc(doc(db, 'groups', groupId, 'logs', logId), { reactions: { [uid]: emoji } }, { merge: true });
}

/**
 * Every log on or after `sinceDate` (YYYY-MM-DD), with NO count limit.
 *
 * The windowed feed (subscribeGroupLogs) is wrong for weekly aggregates: it
 * takes the N most recent logs regardless of date, so a busy group's window
 * stops short of the period being measured. Prod 2026-08-16: BPM logged 400
 * entries in 14 days, the 250-log window only reached 2026-08-07, and the
 * Progress card compared a full 48-workout week against a TRUNCATED 20-workout
 * baseline — printing a green ▲ while the group was actually down 12 workouts.
 * Anything that aggregates a date range must bound by DATE, not by count.
 */
/**
 * YYYY-MM-DD for `n` days ago — the floor for a date-bounded feed.
 * TZ-aware so the boundary matches the scorer's day boundaries rather than
 * whatever timezone the device happens to be in.
 */
export function daysAgoYYYYMMDD(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return yyyyMmDdInTz(d, DEFAULT_TZ);
}

export function subscribeGroupLogsSince(
  groupId: string,
  sinceDate: string,
  onChange: (logs: GroupLog[]) => void,
  onError?: (err: unknown) => void,
) {
  const ref = query(collection(db, 'groups', groupId, 'logs'), where('date', '>=', sinceDate));
  return onSnapshot(
    ref,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) }))),
    onError,
  );
}

/**
 * ONE member's logs since a date. The per-member screens were reading the
 * whole group's history to render a single person's calendar: 1,020 docs in an
 * 8-member group, ~5,100 in a 40-member one, to mark the days of one member.
 * Uses the existing uid+date composite index.
 */
export function subscribeMemberLogsSince(
  groupId: string,
  uid: string,
  sinceDate: string,
  onChange: (logs: GroupLog[]) => void,
  onError?: (err: unknown) => void,
) {
  const ref = query(
    collection(db, 'groups', groupId, 'logs'),
    where('uid', '==', uid),
    where('date', '>=', sinceDate),
  );
  return onSnapshot(
    ref,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) }))),
    onError,
  );
}

export function subscribeGroupLogs(
  groupId: string,
  onChange: (logs: GroupLog[]) => void,
  onError?: (err: unknown) => void,
  max: number = 50,
) {
  const ref = query(
    collection(db, 'groups', groupId, 'logs'),
    orderBy('ts', 'desc'),
    limit(max),
  );

  return onSnapshot(
    ref,
    (snap) => {
      const items: GroupLog[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) }));
      onChange(items);
    },
    onError,
  );
}

export function subscribeGroupPhotoLogs(
  groupId: string,
  onChange: (logs: GroupLog[]) => void,
  onError?: (err: unknown) => void,
  max: number = 50,
) {
  const ref = query(
    collection(db, 'groups', groupId, 'logs'),
    where('type', '==', 'photo'),
    orderBy('ts', 'desc'),
    limit(max),
  );

  return onSnapshot(
    ref,
    (snap) => {
      const items: GroupLog[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<GroupLog, 'id'>),
      }));
      onChange(items);
    },
    onError,
  );
}

/**
 * Delete a log entry
 */
export async function deleteLog(groupId: string, logId: string): Promise<void> {
  if (!db) {
    throw new Error('Firebase database not initialized');
  }
  await deleteGroupLogById(groupId, logId, { tombstone: false });
  await touchGroupActivity(groupId);
}



/**
 * One-shot fetch of MY logs in a date range (inclusive) — powers the History
 * calendar. Queries by uid + date directly (composite index: logs uid+date)
 * instead of scanning the group's newest-N logs, so months-old days resolve
 * no matter how chatty the group is.
 */
export async function fetchMyLogsInRange(params: {
  groupId: string;
  uid: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<GroupLog[]> {
  const ref = query(
    collection(db, 'groups', params.groupId, 'logs'),
    where('uid', '==', params.uid),
    where('date', '>=', params.startDate),
    where('date', '<=', params.endDate),
  );
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupLog, 'id'>) }));
}
