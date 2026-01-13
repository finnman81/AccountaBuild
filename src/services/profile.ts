import { doc, onSnapshot, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { upsertMyPublicUser } from './publicUsers';

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  height: number | null;
  age: number | null;
  weightCurrent: number | null;
  weightGoal: number | null;
};

export function subscribeMyProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const data = snap.data() as any;
      onChange({
        uid,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
        photoURL: data.photoURL ?? null,
        height: data.height ?? null,
        age: data.age ?? null,
        weightCurrent: data.weightCurrent ?? null,
        weightGoal: data.weightGoal ?? null,
      });
    },
    onError,
  );
}

export async function updateMyProfile(params: {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  height?: number | null;
  age?: number | null;
  weightCurrent?: number | null;
  weightGoal?: number | null;
}) {
  await setDoc(
    doc(db, 'users', params.uid),
    {
      displayName: params.displayName ?? null,
      photoURL: params.photoURL ?? null,
      height: params.height ?? null,
      age: params.age ?? null,
      weightCurrent: params.weightCurrent ?? null,
      weightGoal: params.weightGoal ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Keep a restricted “public” copy for group members to read without duplicating per-group.
  await upsertMyPublicUser(params.uid, {
    uid: params.uid,
    displayName: params.displayName ?? null,
    photoURL: params.photoURL ?? null,
    height: params.height ?? null,
    age: params.age ?? null,
    weightCurrent: params.weightCurrent ?? null,
    weightGoal: params.weightGoal ?? null,
  });
}

export type PublicMemberProfile = {
  displayName: string | null;
  photoURL?: string | null;
  height: number | null;
  age: number | null;
  weightCurrent: number | null;
  weightGoal: number | null;
};

export async function syncMyMemberProfileToAllGroups(uid: string) {
  // Back-compat shim: previously this function denormalized user profile into every group.
  // We now keep a restricted universal `publicUsers/{uid}` doc instead.
  const userSnap = await getDoc(doc(db, 'users', uid));
  const data = (userSnap.exists() ? (userSnap.data() as any) : {}) as any;
  await upsertMyPublicUser(uid, {
    uid,
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    height: data.height ?? null,
    age: data.age ?? null,
    weightCurrent: data.weightCurrent ?? null,
    weightGoal: data.weightGoal ?? null,
  });
}


