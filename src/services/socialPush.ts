import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type SocialPushType = 'cheer' | 'nudge' | 'reaction';

/**
 * Enqueue a cheer/nudge/reaction for delivery. A Cloud Function (see
 * functions/) picks this up, looks up the recipient's push token server-side,
 * gates nudges on the recipient's allowNudges setting, sends the Expo push,
 * and deletes the doc. Clients only WRITE here — they never read tokens or
 * the queue.
 */
export async function enqueueSocialPush(params: {
  toUid: string;
  fromUid: string;
  fromName: string;
  type: SocialPushType;
  /** Reaction extras: what emoji, on what kind of log ("workout", "weight"…). */
  emoji?: string;
  logType?: string;
  /**
   * Which hype variant to send (see services/hypeCatalog.ts). Only the ID
   * travels — the Cloud Function renders the copy from its own catalog, so a
   * modified client can't push arbitrary text at someone. Omitted = the
   * original generic cheer/nudge wording.
   */
  hypeId?: string;
}): Promise<void> {
  if (!params.toUid || !params.fromUid || params.toUid === params.fromUid) return;
  await addDoc(collection(db, 'pushQueue'), {
    toUid: params.toUid,
    fromUid: params.fromUid,
    fromName: params.fromName.slice(0, 60),
    type: params.type,
    ...(params.emoji ? { emoji: params.emoji.slice(0, 8) } : {}),
    ...(params.logType ? { logType: params.logType.slice(0, 20) } : {}),
    ...(params.hypeId ? { hypeId: params.hypeId.slice(0, 24) } : {}),
    createdAt: serverTimestamp(),
  });
}
