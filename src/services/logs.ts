import {
  addDoc,
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
} from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { touchGroupActivity } from './groups';
import { isValidYYYYMMDD, todayYYYYMMDD } from '../utils/dates';

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
  | 'yoga'
  | 'stretching'
  | 'meditation'
  | 'pilates'
  | 'taiChi'
  | 'tennis'
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

export async function addCaloriesLog(params: {
  groupId: string;
  uid: string;
  calories: number;
  meal: MealType;
  note?: string;
  date?: string; // YYYY-MM-DD
  source?: 'self_reported' | 'apple_health' | 'google_fit' | 'mixed' | string;
}) {
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
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
  await touchGroupActivity(params.groupId);
  return res;
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
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
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
  await touchGroupActivity(params.groupId);
  return res;
}

export async function addWeightLog(params: {
  groupId: string;
  uid: string;
  weight: number;
  note?: string;
  date?: string; // YYYY-MM-DD
  source?: 'self_reported' | 'apple_health' | 'google_fit' | 'mixed' | string;
}) {
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
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
  await touchGroupActivity(params.groupId);
  return res;
}

export async function addPhotoLog(params: {
  groupId: string;
  uid: string;
  url: string;
  caption?: string;
  date?: string; // YYYY-MM-DD
}) {
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
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
  await touchGroupActivity(params.groupId);
  return res;
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
export async function upsertGroupLogById(
  groupId: string,
  logId: string,
  data: { uid: string; type: LogType; date?: string; source?: string; payload: Record<string, unknown>; eventAt?: Date },
): Promise<string> {
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
  if (opts?.tombstone !== false) {
    try {
      const snap = await getDoc(doc(db, 'groups', groupId, 'logs', logId));
      const d = snap.exists() ? (snap.data() as any) : null;
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
  const logRef = doc(db, 'groups', groupId, 'logs', logId);
  await deleteDoc(logRef);
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
