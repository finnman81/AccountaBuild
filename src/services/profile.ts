import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

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
  // Read my profile (self-read allowed by rules)
  const userSnap = await getDoc(doc(db, 'users', uid));
  const data = (userSnap.exists() ? (userSnap.data() as any) : {}) as any;

  const publicProfile: PublicMemberProfile = {
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    height: data.height ?? null,
    age: data.age ?? null,
    weightCurrent: data.weightCurrent ?? null,
    weightGoal: data.weightGoal ?? null,
  };

  // Read my group membership list (users/{uid}/groups)
  const groupsSnap = await getDocs(collection(db, 'users', uid, 'groups'));
  const groupIds = groupsSnap.docs
    .map((d) => (d.data() as any)?.groupId ?? d.id)
    .filter(Boolean) as string[];

  await Promise.all(
    groupIds.map((groupId) =>
      setDoc(
        doc(db, 'groups', groupId, 'members', uid),
        {
          uid,
          displayName: publicProfile.displayName,
          photoURL: publicProfile.photoURL ?? null,
          height: publicProfile.height,
          age: publicProfile.age,
          weightCurrent: publicProfile.weightCurrent,
          weightGoal: publicProfile.weightGoal,
          profileUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
}


