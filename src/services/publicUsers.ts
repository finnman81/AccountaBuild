import {
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type PublicUser = {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  height: number | null;
  age: number | null;
  weightCurrent: number | null;
  weightGoal: number | null;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertMyPublicUser(uid: string, data: Partial<PublicUser>) {
  await setDoc(
    doc(db, 'publicUsers', uid),
    {
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      height: data.height ?? null,
      age: data.age ?? null,
      weightCurrent: data.weightCurrent ?? null,
      weightGoal: data.weightGoal ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribePublicUsers(uids: string[], onChange: (map: Record<string, PublicUser>) => void) {
  const uniq = Array.from(new Set(uids.map((u) => u.trim()).filter(Boolean)));
  if (uniq.length === 0) {
    onChange({});
    return () => {};
  }

  let latest: Record<string, PublicUser> = {};
  const unsubs: Array<() => void> = [];

  const emit = () => onChange({ ...latest });

  for (const batch of chunk(uniq, 10)) {
    const ref = query(collection(db, 'publicUsers'), where(documentId(), 'in', batch));
    const unsub = onSnapshot(
      ref,
      (snap) => {
      // Update only docs within this batch.
      for (const id of batch) {
        if (!snap.docs.some((d) => d.id === id)) {
          // Keep old if not returned (permission/doesn't exist) – but don't fabricate.
          continue;
        }
      }
      for (const d of snap.docs) {
        const data = d.data() as any;
        latest[d.id] = {
          uid: d.id,
          displayName: data?.displayName ?? null,
          photoURL: data?.photoURL ?? null,
          height: data?.height ?? null,
          age: data?.age ?? null,
          weightCurrent: data?.weightCurrent ?? null,
          weightGoal: data?.weightGoal ?? null,
        };
      }
      emit();
      },
      () => {
        // Safety net: if a batch contains any uid the viewer can't read yet, Firestore can throw
        // permission-denied for the whole query. We rely on the visibility index to prevent that,
        // but this keeps the app from crashing if it happens.
        emit();
      },
    );
    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}

