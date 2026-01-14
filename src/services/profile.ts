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
  // Important: treat `undefined` as "no change". Only explicit `null` clears a field.
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (params.displayName !== undefined) patch.displayName = params.displayName;
  if (params.photoURL !== undefined) patch.photoURL = params.photoURL;
  if (params.height !== undefined) patch.height = params.height;
  if (params.age !== undefined) patch.age = params.age;
  if (params.weightCurrent !== undefined) patch.weightCurrent = params.weightCurrent;
  if (params.weightGoal !== undefined) patch.weightGoal = params.weightGoal;

  await setDoc(doc(db, 'users', params.uid), patch, { merge: true });

  // Keep a restricted “public” copy for group members to read without duplicating per-group.
  const publicPatch: Record<string, unknown> = { uid: params.uid };
  if (params.displayName !== undefined) publicPatch.displayName = params.displayName;
  if (params.photoURL !== undefined) publicPatch.photoURL = params.photoURL;
  if (params.height !== undefined) publicPatch.height = params.height;
  if (params.age !== undefined) publicPatch.age = params.age;
  if (params.weightCurrent !== undefined) publicPatch.weightCurrent = params.weightCurrent;
  if (params.weightGoal !== undefined) publicPatch.weightGoal = params.weightGoal;

  await upsertMyPublicUser(params.uid, publicPatch);
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
  // Important: do NOT write nulls for missing fields — that can unintentionally wipe profile info.
  // Only propagate fields that exist on the source doc. (Explicit `null` remains supported.)
  const patch: Record<string, unknown> = { uid };
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if (data.photoURL !== undefined) patch.photoURL = data.photoURL;
  if (data.height !== undefined) patch.height = data.height;
  if (data.age !== undefined) patch.age = data.age;
  if (data.weightCurrent !== undefined) patch.weightCurrent = data.weightCurrent;
  if (data.weightGoal !== undefined) patch.weightGoal = data.weightGoal;
  await upsertMyPublicUser(uid, patch);
}


