import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type GroupMessage = {
  id: string;
  groupId: string;
  uid: string;
  text: string;
  createdAt?: unknown;
};

export async function sendGroupMessage(params: { groupId: string; uid: string; text: string }) {
  const trimmed = params.text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, 'groups', params.groupId, 'messages'), {
    uid: params.uid,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
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


