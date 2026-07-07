import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type SocialPushType = 'cheer' | 'nudge';

/**
 * Enqueue a cheer/nudge for delivery. A Cloud Function (see functions/) picks
 * this up, looks up the recipient's push token server-side, gates nudges on the
 * recipient's allowNudges setting, sends the Expo push, and deletes the doc.
 * Clients only WRITE here — they never read tokens or the queue.
 */
export async function enqueueSocialPush(params: {
  toUid: string;
  fromUid: string;
  fromName: string;
  type: SocialPushType;
}): Promise<void> {
  if (!params.toUid || !params.fromUid || params.toUid === params.fromUid) return;
  await addDoc(collection(db, 'pushQueue'), {
    toUid: params.toUid,
    fromUid: params.fromUid,
    fromName: params.fromName.slice(0, 60),
    type: params.type,
    createdAt: serverTimestamp(),
  });
}
