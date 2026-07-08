import { collection, getDocs, limit, onSnapshot, orderBy, query, where, writeBatch } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type ActivityType = 'cheer' | 'nudge' | 'promotion' | 'demotion';

export type ActivityItem = {
  id: string;
  type: ActivityType;
  fromUid?: string | null;
  fromName?: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAtMs: number | null;
};

function toMs(t: any): number | null {
  if (t?.toMillis) return t.toMillis();
  if (typeof t?.seconds === 'number') return t.seconds * 1000;
  return null;
}

/** Live feed of a user's activity (cheers/nudges received, rank changes). */
export function subscribeMyActivity(uid: string, onChange: (items: ActivityItem[]) => void, onError?: (e: unknown) => void) {
  const ref = query(collection(db, 'users', uid, 'activity'), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(
    ref,
    (snap) => {
      onChange(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            type: x.type,
            fromUid: x.fromUid ?? null,
            fromName: x.fromName ?? null,
            title: String(x.title ?? ''),
            body: String(x.body ?? ''),
            read: x.read === true,
            createdAtMs: toMs(x.createdAt),
          };
        }),
      );
    },
    onError,
  );
}

/** Live unread count for the bell badge. */
export function subscribeUnreadActivityCount(uid: string, onChange: (n: number) => void) {
  const ref = query(collection(db, 'users', uid, 'activity'), where('read', '==', false), limit(50));
  return onSnapshot(ref, (snap) => onChange(snap.size), () => onChange(0));
}

/** Mark all unread activity as read (called when the Activity screen opens). */
export async function markAllActivityRead(uid: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'activity'), where('read', '==', false), limit(300)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}
