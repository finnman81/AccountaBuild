import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type GoalStatus = 'active' | 'paused' | 'completed';

export type GlobalGoal =
  | { id: 'workouts'; type: 'workouts'; status: GoalStatus; targetWorkoutsPerWeek: number }
  | { id: 'minutes'; type: 'minutes'; status: GoalStatus; targetMinutesPerWeek: number }
  | { id: 'calorieDays'; type: 'calorieDays'; status: GoalStatus; targetDaysPerWeek: number }
  | {
      id: 'weightLoss';
      type: 'weightLoss';
      status: GoalStatus;
      startWeight: number;
      goalWeight: number;
      startDate: string; // YYYY-MM-DD
      targetEndDate: string; // YYYY-MM-DD
      completionBonusAwarded?: boolean;
    }
  | {
      id: 'weightGain';
      type: 'weightGain';
      status: GoalStatus;
      startWeight: number;
      goalWeight: number;
      startDate: string; // YYYY-MM-DD
      targetEndDate: string; // YYYY-MM-DD
      completionBonusAwarded?: boolean;
    };

export function subscribeMyMmrGoals(uid: string, onChange: (goals: Record<string, any>) => void) {
  return onSnapshot(collection(db, 'users', uid, 'goals'), (snap) => {
    const out: Record<string, any> = {};
    for (const d of snap.docs) out[d.id] = d.data();
    onChange(out);
  });
}

export async function upsertGoal(uid: string, goalId: string, patch: Record<string, unknown>) {
  await setDoc(
    doc(db, 'users', uid, 'goals', goalId),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

