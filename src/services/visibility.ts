import { collection, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebase';

// The index itself is written ONLY by the syncVisibility Cloud Function on
// group member join/leave (rules deny client writes — the old client-written
// index let anyone grant themselves canSee on any uid). The client just
// subscribes.
export function subscribeMyCanSeeUids(uid: string, onChange: (uids: Set<string>) => void) {
  return onSnapshot(collection(db, 'visibility', uid, 'canSee'), (snap) => {
    const s = new Set<string>();
    for (const d of snap.docs) s.add(d.id);
    onChange(s);
  });
}

