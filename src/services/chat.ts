import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { touchGroupActivity } from './groups';

export type GroupMessage = {
  id: string;
  groupId: string;
  uid: string;
  text: string;
  createdAt?: unknown;
  /** Server-posted notice (uid 'system'), e.g. the weekly recap. */
  system?: boolean;
  senderName?: string;
  /**
   * Celebration payload. When present the message renders as a milestone card
   * the whole crew can react to (goal reached, streak milestone, …).
   */
  milestone?: { kind: string; uid: string; title: string; body?: string; emoji?: string };
  /** uid -> emoji, same shape as log reactions. */
  reactions?: Record<string, string | null>;
};

/**
 * Toggle this user's reaction on a chat message. Group members may write ONLY
 * this field (firestore.rules), which is what lets everyone cheer a
 * server-posted milestone card they don't own.
 */
export async function setMessageReaction(groupId: string, messageId: string, uid: string, emoji: string | null): Promise<void> {
  await setDoc(doc(db, 'groups', groupId, 'messages', messageId), { reactions: { [uid]: emoji } }, { merge: true });
}

export async function sendGroupMessage(params: { groupId: string; uid: string; text: string }) {
  const trimmed = params.text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, 'groups', params.groupId, 'messages'), {
    uid: params.uid,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  await touchGroupActivity(params.groupId);
}

/** Just the most recent message (cheap limit-1 read) — for the Today unread dot. */
export function subscribeLatestGroupMessage(
  groupId: string,
  onChange: (message: GroupMessage | null) => void,
  onError?: (err: unknown) => void,
) {
  const ref = query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'desc'), limit(1));
  return onSnapshot(
    ref,
    (snap) => {
      const d = snap.docs[0];
      onChange(d ? ({ id: d.id, groupId, ...(d.data() as Omit<GroupMessage, 'id' | 'groupId'>) }) : null);
    },
    onError,
  );
}

export function subscribeGroupMessages(
  groupId: string,
  onChange: (messages: GroupMessage[]) => void,
  onError?: (err: unknown) => void,
) {
  const ref = query(
    collection(db, 'groups', groupId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(100),
  );

  return onSnapshot(
    ref,
    (snap) => {
      const items: GroupMessage[] = snap.docs.map((d) => ({
        id: d.id,
        groupId,
        ...(d.data() as Omit<GroupMessage, 'id' | 'groupId'>),
      }));
      onChange(items);
    },
    onError,
  );
}


