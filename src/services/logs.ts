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
  await setDoc(
    doc(db, 'groups', groupId, 'logs', logId),
    {
      uid: data.uid,
      type: data.type,
      date: normalizeLogDate(data.date),
      ts: eventAtValid ? Timestamp.fromDate(data.eventAt as Date) : serverTimestamp(),
      // ts is the EVENT time (stable across re-syncs); writtenAt is the wall
      // clock of this write. The gap between them is the sync lag — the only
      // way to verify from data that background delivery actually fires.
      writtenAt: serverTimestamp(),
      source: data.source ?? 'self_reported',
      payload: data.payload,
    },
    { merge: true },
  );
  await touchGroupActivity(groupId);
  return logId;
}

/** Delete a log by id (used when a synced health sample was deleted in Health). */
export async function deleteGroupLogById(groupId: string, logId: string): Promise<void> {
  // Health-synced logs need a TOMBSTONE, or the next sync's idempotent upsert
  // resurrects them ("I delete the extra and it comes back"). Manual logs
  // delete cleanly — sync never re-creates those.
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
