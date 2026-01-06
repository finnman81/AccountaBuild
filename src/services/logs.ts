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

export type WorkoutType = 'weightLifting' | 'running' | 'jogging' | 'ruck' | 'swim';
export type LogType = 'calories' | 'workout' | 'weight' | 'photo';

export type GroupLog = {
  id: string;
  uid: string;
  type: LogType;
  date: string; // YYYY-MM-DD
  ts?: unknown;
  payload: Record<string, unknown>;
};

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function addCaloriesLog(params: {
  groupId: string;
  uid: string;
  calories: number;
  note?: string;
}) {
  return addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'calories',
    date: todayYYYYMMDD(),
    ts: serverTimestamp(),
    payload: {
      calories: params.calories,
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
}) {
  return addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'workout',
    date: todayYYYYMMDD(),
    ts: serverTimestamp(),
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
}) {
  return addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'weight',
    date: todayYYYYMMDD(),
    ts: serverTimestamp(),
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
}) {
  return addDoc(collection(db, 'groups', params.groupId, 'logs'), {
    uid: params.uid,
    type: 'photo',
    date: todayYYYYMMDD(),
    ts: serverTimestamp(),
    payload: {
      url: params.url,
      caption: params.caption?.trim() || null,
    },
  });
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


