import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
  | 'yoga';
export type LogType = 'calories' | 'workout' | 'weight' | 'photo';
export type MealType = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type GroupLog = {
  id: string;
  uid: string;
  type: LogType;
  date: string; // YYYY-MM-DD
  ts?: unknown;
  payload: Record<string, unknown>;
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
}) {
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'calories',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
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
}) {
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'workout',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
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
}) {
  const res = await addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'weight',
    date: normalizeLogDate(params.date),
    ts: serverTimestamp(),
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
    payload: {
      url: params.url,
      caption: params.caption?.trim() || null,
    },
  });
  await touchGroupActivity(params.groupId);
  return res;
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


