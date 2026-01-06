import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type UserGoals = {
  uid: string;
  workoutsPerWeek: number;
  logCaloriesDaysPerWeek: number;
  logWeightDaysPerWeek: number;
  dailyCalorieGoal: number;
  updatedAt?: unknown;
};

export async function upsertUserGoals(params: {
  groupId: string;
  uid: string;
  workoutsPerWeek: number;
  logCaloriesDaysPerWeek: number;
  logWeightDaysPerWeek: number;
  dailyCalorieGoal: number;
}) {
  await setDoc(
    doc(db, 'groups', params.groupId, 'goals', params.uid),
    {
      uid: params.uid,
      workoutsPerWeek: params.workoutsPerWeek,
      logCaloriesDaysPerWeek: params.logCaloriesDaysPerWeek,
      logWeightDaysPerWeek: params.logWeightDaysPerWeek,
      dailyCalorieGoal: params.dailyCalorieGoal,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeGroupGoals(
  groupId: string,
  onChange: (goals: UserGoals[]) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    collection(db, 'groups', groupId, 'goals'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as UserGoals);
      onChange(items);
    },
    onError,
  );
}

export function subscribeMyGoals(
  groupId: string,
  uid: string,
  onChange: (goals: UserGoals | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'groups', groupId, 'goals', uid),
    (snap) => onChange(snap.exists() ? (snap.data() as UserGoals) : null),
    onError,
  );
}


