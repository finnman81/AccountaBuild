import { collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export function subscribeMyCanSeeUids(uid: string, onChange: (uids: Set<string>) => void) {
  return onSnapshot(collection(db, 'visibility', uid, 'canSee'), (snap) => {
    const s = new Set<string>();
    for (const d of snap.docs) s.add(d.id);
    onChange(s);
  });
}

export async function syncMyVisibilityIndex(uid: string) {
  // Ensure you can always read yourself.
  await setDoc(
    doc(db, 'visibility', uid, 'canSee', uid),
    { targetUid: uid, updatedAt: serverTimestamp() },
    { merge: true },
  );

  // Read my group membership list (users/{uid}/groups).
  const groupsSnap = await getDocs(collection(db, 'users', uid, 'groups'));
  const groupIds = groupsSnap.docs
    .map((d) => (d.data() as any)?.groupId ?? d.id)
    .filter(Boolean) as string[];

  // For each group, list members and grant read access to their public profile.
  await Promise.all(
    groupIds.map(async (groupId) => {
      const membersSnap = await getDocs(collection(db, 'groups', groupId, 'members'));
      await Promise.all(
        membersSnap.docs.map(async (m) => {
          const targetUid = String((m.data() as any)?.uid ?? m.id);
          if (!targetUid) return;
          await setDoc(
            doc(db, 'visibility', uid, 'canSee', targetUid),
            { targetUid, groupId, updatedAt: serverTimestamp() },
            { merge: true },
          );
        }),
      );
    }),
  );
}

