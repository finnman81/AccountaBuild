import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type UserGroupListItem = {
  groupId: string;
  name: string;
  description: string | null;
  joinCode: string;
  role: 'admin' | 'member';
  // Optional per-user “last seen” timestamps for badges.
  chatLastSeenAt?: unknown;
  photosLastSeenAt?: unknown;
};

function normalizeJoinCode(code: string) {
  return code.trim().toUpperCase();
}

function generateJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoids ambiguous chars
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function reserveJoinCode(params: {
  createdBy: string;
  groupId: string;
  name: string;
  description: string | null;
}) {
  // Try a few times to avoid collisions.
  for (let i = 0; i < 8; i += 1) {
    const joinCode = generateJoinCode();
    const ref = doc(db, 'joinCodes', joinCode);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    await setDoc(ref, {
      joinCode,
      groupId: params.groupId,
      name: params.name,
      description: params.description,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return joinCode;
  }
  throw new Error('Failed to generate unique join code');
}

export async function ensureJoinCodeMapping(params: {
  joinCode: string;
  groupId: string;
  name: string;
  description: string | null;
  createdBy: string;
}) {
  const code = normalizeJoinCode(params.joinCode);
  const ref = doc(db, 'joinCodes', code);
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    joinCode: code,
    groupId: params.groupId,
    name: params.name,
    description: params.description,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createGroup(params: {
  uid: string;
  displayName?: string | null;
  name: string;
  description?: string;
}): Promise<{ groupId: string; joinCode: string }> {
  const name = params.name.trim();
  const description = params.description?.trim() || null;

  const groupRef = await addDoc(collection(db, 'groups'), {
    name,
    description,
    joinCode: '__pending__',
    createdBy: params.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const groupId = groupRef.id;
  const joinCode = await reserveJoinCode({
    createdBy: params.uid,
    groupId,
    name,
    description,
  });

  await setDoc(doc(db, 'groups', groupId), { joinCode }, { merge: true });

  // Write membership in two places:
  // 1) groups/{groupId}/members/{uid} for group-scoped reads
  // 2) users/{uid}/groups/{groupId} for efficient “my groups” listing
  await Promise.all([
    setDoc(doc(db, 'groups', groupId, 'members', params.uid), {
      uid: params.uid,
      displayName: params.displayName ?? null,
      role: 'admin',
      joinedAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', params.uid, 'groups', groupId), {
      groupId,
      name,
      description,
      joinCode,
      role: 'admin',
      joinedAt: serverTimestamp(),
      chatLastSeenAt: serverTimestamp(),
      photosLastSeenAt: serverTimestamp(),
    }),
  ]);

  return { groupId, joinCode };
}

export async function joinGroupByCode(params: {
  uid: string;
  displayName?: string | null;
  joinCode: string;
}): Promise<{ groupId: string }> {
  const code = normalizeJoinCode(params.joinCode);
  const joinRef = doc(db, 'joinCodes', code);
  const joinSnap = await getDoc(joinRef);
  if (!joinSnap.exists()) throw new Error('Invalid join code');

  const join = joinSnap.data() as { groupId: string; name?: string; description?: string | null; joinCode?: string };
  const groupId = join.groupId;
  const name = join.name ?? 'Group';
  const description = join.description ?? null;

  // Guard against stale join codes pointing at deleted groups.
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) throw new Error('Group no longer exists');

  await Promise.all([
    setDoc(
      doc(db, 'groups', groupId, 'members', params.uid),
      { uid: params.uid, displayName: params.displayName ?? null, role: 'member', joinedAt: serverTimestamp() },
      { merge: true },
    ),
    setDoc(
      doc(db, 'users', params.uid, 'groups', groupId),
      {
        groupId,
        name,
        description,
        joinCode: join.joinCode ?? code,
        role: 'member',
        joinedAt: serverTimestamp(),
        chatLastSeenAt: serverTimestamp(),
        photosLastSeenAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  return { groupId };
}

export async function deleteGroupAsCreator(params: { uid: string; groupId: string }) {
  const groupRef = doc(db, 'groups', params.groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('Group not found');
  const data = groupSnap.data() as any;
  if (data?.createdBy !== params.uid) throw new Error('Only the group creator can delete this group');

  // Best-effort cleanup: remove creator’s membership pointers.
  await Promise.allSettled([
    deleteDoc(doc(db, 'users', params.uid, 'groups', params.groupId)),
    deleteDoc(doc(db, 'groups', params.groupId, 'members', params.uid)),
  ]);

  // Delete join code mapping so nobody can join after deletion.
  const joinCode = String(data?.joinCode ?? '').trim();
  if (joinCode) {
    await Promise.allSettled([deleteDoc(doc(db, 'joinCodes', joinCode))]);
  }

  // Delete the group doc last (rules gate access to subcollections off group existence now).
  await deleteDoc(groupRef);
}

export function subscribeMyGroups(
  uid: string,
  onChange: (groups: UserGroupListItem[]) => void,
  onError?: (err: unknown) => void,
) {
  const ref = collection(db, 'users', uid, 'groups');
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as UserGroupListItem);

      // If a group doc was deleted but the user's membership doc remains,
      // hide it from the UI and delete the stale membership doc.
      void (async () => {
        const checked = await Promise.all(
          items.map(async (g) => {
            if (!g?.groupId) return null;
            const groupSnap = await getDoc(doc(db, 'groups', g.groupId));
            if (!groupSnap.exists()) {
              await deleteDoc(doc(db, 'users', uid, 'groups', g.groupId));
              return null;
            }
            return g;
          }),
        );

        const kept = checked.filter(Boolean) as UserGroupListItem[];
        onChange(kept.sort((a, b) => a.name.localeCompare(b.name)));
      })().catch((err) => {
        // Fallback: show what we have; caller can surface an error if desired.
        onChange(items.sort((a, b) => a.name.localeCompare(b.name)));
        onError?.(err);
      });
    },
    onError,
  );
}

export function subscribeMyGroupMeta(
  uid: string,
  groupId: string,
  onChange: (meta: UserGroupListItem | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid, 'groups', groupId),
    (snap) => onChange(snap.exists() ? (snap.data() as UserGroupListItem) : null),
    onError,
  );
}

export async function markGroupChatSeen(params: { uid: string; groupId: string }) {
  await setDoc(
    doc(db, 'users', params.uid, 'groups', params.groupId),
    { chatLastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

export async function markGroupPhotosSeen(params: { uid: string; groupId: string }) {
  await setDoc(
    doc(db, 'users', params.uid, 'groups', params.groupId),
    { photosLastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setGroupLogoUrl(params: { groupId: string; logoUrl: string | null }) {
  await updateDoc(doc(db, 'groups', params.groupId), {
    logoUrl: params.logoUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}


