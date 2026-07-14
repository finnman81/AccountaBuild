import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { isValidYYYYMMDD, todayYYYYMMDD } from '../utils/dates';
import { addWeightLog } from './logs';
import { updateMyProfile, syncMyMemberProfileToAllGroups } from './profile';

function normalizeLogDate(date?: string) {
  const d = (date ?? '').trim();
  return isValidYYYYMMDD(d) ? d : todayYYYYMMDD();
}

export async function updateGroupLog(params: {
  groupId: string;
  logId: string;
  date: string;
  payload: Record<string, unknown>;
}) {
  await updateDoc(doc(db, 'groups', params.groupId, 'logs', params.logId), {
    date: normalizeLogDate(params.date),
    payload: params.payload,
    updatedAt: serverTimestamp(),
  });
}

export async function upsertUserWorkoutHistoryFromGroupLog(params: {
  uid: string;
  groupId: string;
  groupLogId: string;
  date: string;
  workoutType: string;
  durationMinutes: number;
}) {
  const ref = query(
    collection(db, 'users', params.uid, 'workouts'),
    where('groupLogId', '==', params.groupLogId),
    limit(5),
  );
  const snap = await getDocs(ref);
  if (snap.size > 0) {
    await Promise.all(
      snap.docs.map((d) =>
        updateDoc(d.ref, {
          date: normalizeLogDate(params.date),
          workoutType: params.workoutType,
          durationMinutes: params.durationMinutes,
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    return;
  }

  // Fallback: create a new user-level entry so profile charts reflect edits going forward.
  await addDoc(collection(db, 'users', params.uid, 'workouts'), {
    uid: params.uid,
    groupId: params.groupId,
    groupLogId: params.groupLogId,
    date: normalizeLogDate(params.date),
    workoutType: params.workoutType,
    durationMinutes: params.durationMinutes,
    ts: serverTimestamp(),
    source: 'self_reported',
  });
}

export async function upsertUserWeightHistoryFromGroupLog(params: {
  uid: string;
  groupId: string;
  groupLogId: string;
  date: string;
  weight: number;
}) {
  const ref = query(
    collection(db, 'users', params.uid, 'weights'),
    where('groupLogId', '==', params.groupLogId),
    limit(5),
  );
  const snap = await getDocs(ref);
  if (snap.size > 0) {
    await Promise.all(
      snap.docs.map((d) =>
        updateDoc(d.ref, {
          date: normalizeLogDate(params.date),
          weight: params.weight,
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    return;
  }

  await addDoc(collection(db, 'users', params.uid, 'weights'), {
    uid: params.uid,
    groupId: params.groupId,
    groupLogId: params.groupLogId,
    date: normalizeLogDate(params.date),
    weight: params.weight,
    ts: serverTimestamp(),
    source: 'self_reported',
  });
}


/**
 * Log a weight EVERYWHERE it needs to land, in one call:
 *  1. the group log (chat/leaderboard/FP inputs),
 *  2. users/{uid}/weights history (profile + progress charts),
 *  3. profile weightCurrent (+ its public/group mirrors).
 * LogComposer used to write only #1, so the profile's "Current weight" card
 * silently drifted from what the user actually logged.
 */
export async function addWeightEverywhere(params: {
  groupId: string;
  uid: string;
  weight: number; // lb (storage unit)
  date: string; // YYYY-MM-DD
  note?: string;
}) {
  const res = await addWeightLog({ groupId: params.groupId, uid: params.uid, weight: params.weight, note: params.note, date: params.date });
  await addDoc(collection(db, 'users', params.uid, 'weights'), {
    uid: params.uid,
    groupId: params.groupId,
    groupLogId: res.id,
    date: params.date,
    weight: params.weight,
    ts: serverTimestamp(),
    source: 'self_reported',
  });
  await updateMyProfile({ uid: params.uid, weightCurrent: params.weight });
  await syncMyMemberProfileToAllGroups(params.uid);
  return res;
}
