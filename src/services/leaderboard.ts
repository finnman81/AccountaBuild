import { collection, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export function subscribeGroupMemberUids(groupId: string, onChange: (uids: string[]) => void) {
  return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
    const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
    onChange(uids);
  });
}

